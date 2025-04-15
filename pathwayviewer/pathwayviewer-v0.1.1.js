// See https://github.com/siuc-nate/pathway-viewer/tree/v0.1.1
// Global object to stored data about all Pathways loaded on this page
var PathwayViewer = {
    Resources: {},
    Viewers: []
};

// Load a pathway and render it into the specified container
PathwayViewer.loadPathway = async function(
    container,
    pathwayURI,
    options
){
    // Setup a Viewer
    // Each viewer is 1:1 with a container
    var Viewer = {
        PathwayURI: pathwayURI,
        Status: "Loading",
        Container: container,
        RawPathwayGraph: null,
        RawProgressionModelGraph: null,
        Error: null,
        Messages: [],
        Options: {
            ...(options || {}),
            UI: {
                PathwayHeaderTag: "h2",
                DefaultComponentProgressionLevelHeaderLabel: { "en-us": "Components" },
                DefaultDestinationProgressionLevelHeaderLevel: { "en-us": "Destination" },
                ComponentURILinks: [
                    { Label: { "en-us": "View Component in Credential Registry" }, URIPattern: "{uri}" },
                    { Label: { "en-us": "View Component in Credential Finder" }, URIPattern: "https://credentialfinder.org/resources/{ctid}" }
                ],
                ComponentProxyForLinks: [
                    { Label: { "en-us": "View Resource in Credential Registry" }, URIPattern: "{uri}" },
                    { Label: { "en-us": "View Resource in Credential Finder" }, URIPattern: "https://credentialfinder.org/resources/{ctid}" }
                ],
                ...(options?.UI || {})
            },
            Language: {
                MaxCodes: 100,
                AllowAll: true,
                PreferredCodes: ["en-US", "en-us", "en"],
                ValueJoiner: ", ",
                ...(options?.Language || {})
            }
        },
        Data: {}
    };

    // Update container div and ensure styles exist
    Viewer.Container.classList.add("pathwayViewer");
    Viewer.Container.classList.add("pathwayOuterContainer");
    Viewer.Container.setAttribute("data-pathwayuri", Viewer.PathwayURI);
    PathwayViewer.ensureStyles();

    // Container for UI
    Viewer.UI = {
        Header: PathwayViewer.createTag(Viewer.Options.UI.PathwayHeaderTag, "pathwayViewer pathwayHeader").appendTo(Viewer.Container),
        Content: PathwayViewer.createTag("div", "pathwayViewer pathwayContent").appendTo(Viewer.Container),
        Messages: PathwayViewer.createTag("div", "pathwayViewer pathwayMessages").appendTo(Viewer.Container),
        ProgressionLevels: [],
        Components: []
    };

    // Simplify getting text for this Viewer by always applying its Language Options
    Viewer.getText = function(value, cssClass){
        return PathwayViewer.getText(Viewer.Options.Language, value, cssClass);
    }

    // Helper method to print an error for this Viewer
    Viewer.addError = function(message, data){
        console.error(message, data);
        Viewer.UI.Messages.append(PathwayViewer.createTag("div", "pathwayViewer error").appendText(message));
    }

    Viewer.getContentNodePosition = function(element){
        var rect = element.getBoundingClientRect();
        var contentRect = Viewer.UI.Content.getBoundingClientRect();
        return {
            LeftCenter: { 
                x: rect.x - contentRect.x + Viewer.UI.Content.scrollLeft, 
                y: rect.y + (rect.height * 0.5) - contentRect.y + Viewer.UI.Content.scrollTop
            },
            RightCenter: { 
                x: rect.x + rect.width - contentRect.x + Viewer.UI.Content.scrollLeft, 
                y: rect.y + (rect.height * 0.5) - contentRect.y + Viewer.UI.Content.scrollTop
            }
        };
    }

    // Track the Viewer
    PathwayViewer.Viewers.push(Viewer);
    
    // Load the Pathway Graph and store it (or handle errors)
    await PathwayViewer.getResource(pathwayURI.replace("/resources/", "/graph/"))
    .then(pathway => {
        Viewer.RawPathwayGraph = pathway;
    }).catch(error => {
        Viewer.Error = error;
        Viewer.Messages = [Viewer.Error.MainError, ...Viewer.Error.ErrorList];
    });

    // Render the Viewer and return it
    PathwayViewer.renderViewer(Viewer);
    return Viewer;
}

// Get a Resource via cached requests to prevent multiple fetches of the same Resource
PathwayViewer.getResource = async function(resourceURI){
    // Find an existing request Promise for this URI
    var resourcePromise = PathwayViewer.Resources[resourceURI];

    // If available, return that Promise
    if(resourcePromise){
        return resourcePromise;
    }
    // Otherwise, create one and track it
    else{
        // Construct the Promise
        resourcePromise = new Promise(async (resolve, reject) => {
            // Enable including the raw response body in an error message if needed
            var rawData;

            // Try to fetch the data and parse it as text
            try{
                var response = await fetch(resourceURI);
                rawData = await response.text();
            }
            // On error, reject the Promise with the normalized error object
            catch(error){
                reject(PathwayViewer.buildError(`Error loading data for Resource URI: ${resourceURI}`, [], { ...error }));
            }
        
            // Enable including the parsed data in an error message if needed
            var parsed;
            // Try to parse the raw text as JSON
            try{
                parsed = JSON.parse(rawData);
            }
            // On error, reject the Promise with the normalized error object
            catch(error){
                reject(PathwayViewer.buildError(`Error parsing data for Resource URI: ${resourceURI}`, [], { ...error, RawData: rawData }));
            }

            // Look for errors returned from the Registry
            var registryLevelErrors = parsed.error || parsed.errors;
            if(registryLevelErrors){
                // If any are found, reject the Promise with the normalized error object
                reject(PathwayViewer.buildError(
                    `One or more errors encountered for Resource URI: ${resourceURI}`, 
                    Array.isArray(registryLevelErrors) ? registryLevelErrors : [registryLevelErrors], 
                    { ...parsed }
                ));
            }

            // Resolve the Promise
            resolve(parsed);
        });

        // Track the Promise so that it will be returned to any other requests for the same URI even if the Promise hasn't finished yet
        PathwayViewer.Resources[resourceURI] = resourcePromise;

        // Return the Promise
        return resourcePromise;
    }
}

// Helper method to build a normalized error message to make subsequent handling easier
PathwayViewer.buildError = function(mainError, errorList, rawError){
    var error = {
        MainError: mainError,
        ErrorList: errorList,
        RawError: rawError
    };
    console.error(mainError, error);
    return error;
}

// Simple method to create an HTML tag with a few extra features
PathwayViewer.createTag = function(tag, className, attributes){
    var Tag = document.createElement(tag);
    className && (Tag.className = className);
    attributes && Object.keys(attributes).forEach(key => {
        Tag.setAttribute(key, attributes[key]);
    });

    Tag.appendTo = function(container){
        container.appendChild(Tag);
        return Tag;
    }

    Tag.append = function(otherTag){
        Tag.appendChild(otherTag);
        return Tag;
    }

    Tag.appendText = function(text){
        Tag.innerHTML += text;
        return Tag;
    }

    return Tag;
}

// Get the text of a value, applying Language Map handling options if applicable
PathwayViewer.getText = function(LanguageOptions, value, cssClass){
    // If there is no value, return an empty string
    if(!value){
        return "";
    }
    // If the value is an array, join the values together and return a string
    else if(Array.isArray(value)){
        return value.join(LanguageOptions.ValueJoiner);
    }
    // If the value is an object, treat it like a Language Map
    else if(typeof(value) == "object"){
        var keys = Object.keys(value);
        var renderable = [];

        // Prioritize the preferred language codes
        LanguageOptions.PreferredCodes.forEach(code => {
            if(renderable.length >= LanguageOptions.MaxCodes){
                return;
            }
            keys.includes(code) && renderable.push({ code: code, value: value[code] });
        });

        // If other language codes are allowed, append them up to the max limit
        LanguageOptions.AllowAll && keys.filter(key => !renderable.find(m => m.code == key)).forEach(code => {
            if(renderable.length >= LanguageOptions.MaxCodes){
                return;
            }
            renderable.push({ code: code, value: value[code] });
        });
        
        // Render the Language Map data as HTML and return it
        return renderable.map(m => `<div class="pathwayViewer langString ${cssClass || ""}" data-language="${m.code}">
            <span class="langCode">${m.code}</span>
            <span class="langValue">${PathwayViewer.normalizeArrayValue(m.value).join(LanguageOptions.ValueJoiner)}</span>
        </div>`);
    }
}

// Helper method to normalize handling for values that may or may not be present and may or may not be an array
PathwayViewer.normalizeArrayValue = function(value){
    return !value ? [] : Array.isArray(value) ? value : [value];
}

// Render a Viewer and its Pathway data
PathwayViewer.renderViewer = async function(Viewer){
    // (Re-)set the status and containers
    Viewer.Status = "Rendering";
    Viewer.UI.RenderedComponents = [];
    Viewer.UI.RenderedConditions = [];
    Viewer.UI.ProgressionLevels = [];
    Viewer.UI.Header.innerHTML = "";
    Viewer.UI.Content.innerHTML = "";
    Viewer.UI.Messages.innerHTML = "";
    console.log("Rendering Viewer", Viewer);

    // If any errors occurred earlier, print them and return
    if(Viewer.Error){
        Viewer.Messages.forEach(message => Viewer.addError(message));
        return;
    }

    // Reset container for processed data
    Viewer.Data = {};

    // Extract the Pathway node itself from the raw pathway data and handle errors
    Viewer.Data.Pathway = Viewer.RawPathwayGraph["@graph"].find(node => node["@type"] == "ceterms:Pathway");
    if(!Viewer.Data.Pathway){
        Viewer.addError(`No ceterms:Pathway object found for Pathway ${Viewer.PathwayURI}`, Viewer);
        return;
    }

    // Print the Pathway's name in the header field if applicable
    Viewer.UI.Header.appendText(Viewer.getText(Viewer.Data.Pathway["ceterms:name"]));

    // Find the Destination Component and handle errors
    Viewer.Data.DestinationComponent = Viewer.RawPathwayGraph["@graph"].find(node => 
        PathwayViewer.normalizeArrayValue(node["ceterms:isDestinationComponentOf"]).includes(Viewer.Data.Pathway["@id"]) ||
        PathwayViewer.normalizeArrayValue(Viewer.Data.Pathway["ceterms:hasDestinationComponent"]).includes(node["@id"])
    );
    if(!Viewer.Data.DestinationComponent){
        Viewer.addError(`No Destination Component found for this Pathway.`, Viewer);
        return;
    }

    // Find all of the other components in the raw pathway data
    Viewer.Data.Components = Viewer.RawPathwayGraph["@graph"].filter(node => 
        node["@type"] != "ceterms:Pathway" && 
        node["@type"] != "ceterms:ComponentCondition" &&
        node != Viewer.Data.DestinationComponent
    );

    // (Re-)set the containers for the Pathway's Progression Levels
    Viewer.Data.AllProgressionLevels = [];
    Viewer.Data.TopProgressionLevels = [];

    // If the Pathway references a Progression Model, find its URI and load it
    // A Progression Model is optional, so errors here aren't necessarily fatal
    var progressionModelURI = PathwayViewer.normalizeArrayValue(Viewer.Data.Pathway["asn:hasProgressionModel"])[0] || ""
    if(progressionModelURI){
        // Get the Progression Model Graph
        await PathwayViewer.getResource(progressionModelURI.replace("/resources/", "/graph/"))
        .then(progressionModel => PathwayViewer.processRawProgressionModelData(Viewer, progressionModel))
        .catch(error => {
            Viewer.addError(`Error loading Progression Model from URI ${progressionModelURI}`, error);
        });
    }

    // Render the Progression Model and/or dummy levels
    PathwayViewer.renderProgressionLevels(Viewer);

    // Kick off the recursive Component rendering with the Destination Component
    await PathwayViewer.renderComponent(Viewer, Viewer.Data.DestinationComponent);

    // Check to see if any components were not rendered
    Viewer.Data.Components.forEach(Component => {
        if(!Viewer.UI.RenderedComponents.find(RenderedComponent => RenderedComponent.Component == Component)){
            Viewer.addError(`Component ${Component["ceterms:ctid"]} was not rendered in this Pathway, as no other Component appears to reference it.`, { Viewer: Viewer, Component: Component });
        }
    });

    // Render arrows after a brief delay, and on resize
    setTimeout(() => {
        PathwayViewer.renderConnectors(Viewer);
    }, 100);
    window.addEventListener("resize", () => {
        clearTimeout(Viewer.resizeTimeout);
        Viewer.resizeTimeout = setTimeout(() => PathwayViewer.renderConnectors(Viewer), 5);
    });

    // Update status
    Viewer.Status = "Finished";
}

PathwayViewer.processRawProgressionModelData = function(Viewer, progressionModel){
    // Store it
    Viewer.RawProgressionModelGraph = progressionModel;

    // Find the Progression Model node itself, and handle errors
    Viewer.Data.ProgressionModel = Viewer.RawProgressionModelGraph["@graph"].find(node => node["@type"] == "asn:ProgressionModel");
    if(!Viewer.Data.ProgressionModel){
        Viewer.addError(`No Progression Model object found in the Progression Model data for this Pathway.`, Viewer);
    }

    // Find the Progression Levels in the correct order and handle errors
    Viewer.Data.AllProgressionLevels = Viewer.RawProgressionModelGraph["@graph"].filter(node => node["@type"] == "asn:ProgressionLevel");
    Viewer.Data.TopProgressionLevels = PathwayViewer.normalizeArrayValue(Viewer.Data.ProgressionModel?.["skos:hasTopConcept"]).map(levelURI => Viewer.Data.AllProgressionLevels.find(node => node["@id"] == levelURI));
    if(Viewer.Data.TopProgressionLevels.length == 0){
        Viewer.addError("No skos:hasTopConcept value found in Progression Model for this Pathway. Progression Levels may be in an incorrect order.");

        //Attempt to supply a top level based on connections (or lack thereof) between levels
        Viewer.Data.TopProgressionLevels = Viewer.Data.AllProgressionLevels.filter(level => 
            // Where the level doesn't assert some other level is broader, and
            PathwayViewer.normalizeArrayValue(level["skos:broader"]).length == 0 &&
            // Where no other level asserts this level to be narrower
            !Viewer.Data.AllProgressionLevels.some(otherLevel => PathwayViewer.normalizeArrayValue(otherLevel["skos:narrower"]).includes(level["@id"]))
        );

        // If there is still no top level, just assign all levels to the top level
        if(Viewer.Data.TopProgressionLevels.length == 0){
            Viewer.Data.TopProgressionLevels = Viewer.Data.AllProgressionLevels;
        }
    }

    // If the Progression Model doesn't appear to contain any Progression Levels, log an error
    if(Viewer.Data.AllProgressionLevels.length == 0){
        Viewer.addError(`No Progression Level objects found in the Progression Model data for this Pathway.`, Viewer);
    }
}

PathwayViewer.renderProgressionLevels = function(Viewer){
    // Determine whether a dummy column is needed for components that don't reference a level, or which reference an invalid level, and insert it if needed
    var needsComponentDummyColumn = false;
    Viewer.Data.Components.forEach(Component => {
        needsSpecialLevel(Component, "_:CommonLevel") && (needsComponentDummyColumn = true);
    });
    if(needsComponentDummyColumn){
        var dummyLevel = { "@type": "asn:ProgressionLevel", "@id": "_:CommonLevel", "skos:prefLabel": Viewer.Options.UI.DefaultComponentProgressionLevelHeaderLabel };
        Viewer.Data.AllProgressionLevels.unshift(dummyLevel);
        Viewer.Data.TopProgressionLevels.unshift(dummyLevel);
    }

    // Determine whether a dummy column is needed for the destination component and insert it if needed
    if(needsSpecialLevel(Viewer.Data.DestinationComponent, "_:DestinationLevel")){
        var dummyLevel = { "@type": "asn:ProgressionLevel", "@id": "_:DestinationLevel", "skos:prefLabel": Viewer.Options.UI.DefaultDestinationProgressionLevelHeaderLevel };
        Viewer.Data.AllProgressionLevels.push(dummyLevel);
        Viewer.Data.TopProgressionLevels.push(dummyLevel);
    }

    // Scaffold the UI data for the levels
    Viewer.Data.AllProgressionLevels.forEach(Level => {
        Viewer.UI.ProgressionLevels.push({
            ProgressionLevel: Level,
            RenderedChildLevels: [],
            Depth: 0,
            ColSpan: 1
        });
    });

    // Pre-calculate the table structure
    var totalHeaderRows = 1;
    Viewer.Data.TopProgressionLevels.forEach(TopLevel => {
        dive(TopLevel, 1, [], 0);
    });

    // Render the table to contain the Pathway
    Viewer.UI.Table = PathwayViewer.createTag("table", "pathwayViewer progressionModelTable").appendTo(Viewer.UI.Content);
    Viewer.UI.THead = PathwayViewer.createTag("thead", "pathwayViewer progressionModelTableHeader").appendTo(Viewer.UI.Table);
    Viewer.UI.TBody = PathwayViewer.createTag("tbody", "pathwayViewer progressionModelTableBody").appendTo(Viewer.UI.Table);
    Viewer.UI.TBodyRow = PathwayViewer.createTag("tr", "pathwayViewer progressionModelTableBodyRow").appendTo(Viewer.UI.TBody);

    // Add the rows for the header
    var headerCounter = 1;
    Viewer.UI.THeadRows = {};
    while(headerCounter <= totalHeaderRows){
        Viewer.UI.THeadRows[headerCounter] = PathwayViewer.createTag("tr", "pathwayViewer progressionModelTableHeaderRow").appendTo(Viewer.UI.THead);
        headerCounter++;
    }

    // Render the levels
    Viewer.Data.TopProgressionLevels.forEach(TopLevel => {
        // Find the corresponding Rendered Level
        var RenderedTopLevel = Viewer.UI.ProgressionLevels.find(RenderedLevel => RenderedLevel.ProgressionLevel == TopLevel);
        RenderedTopLevel.BodyColumns = [];
        RenderedTopLevel.BodyInners = [];

        PathwayViewer.renderProgressionLevel(Viewer, RenderedTopLevel, TopLevel);
    });

    // Helper function to determine whether a Component has an invalid Progression Level reference, or does not reference any Progression Level
    function needsSpecialLevel(Component, specialLevelURI){
        var needsSpecialLevel = false;

        var levelURIs = PathwayViewer.normalizeArrayValue(Component["asn:hasProgressionLevel"]).filter(levelURI => levelURI != specialLevelURI);
        if(levelURIs.length == 0){
            needsSpecialLevel = true;
        }

        levelURIs.forEach(levelURI => {
            var match = Viewer.Data.AllProgressionLevels.find(Level => levelURI == Level["@id"]);
            if(!match){
                Viewer.addError(`Component ${Component["ceterms:ctid"]} references Progression Level ${levelURI}, but no such Level was found in this Pathway's Progression Model.`);
                needsSpecialLevel = true;
            }
        });

        // Override the component's level if necessary
        if(needsSpecialLevel){
            Component["asn:hasProgressionLevel"] = [specialLevelURI];
        }

        return needsSpecialLevel;
    }

    // Helper function to help determine how to render a given Level
    function dive(Level, depth, parentRenderedLevels, localColumnOffset){
        // Get the UI Level for this Progression Level
        var RenderedLevel = Viewer.UI.ProgressionLevels.find(RenderedLevel => RenderedLevel.ProgressionLevel == Level);

        // If the depth of this dive is greater than the known deepest depth, update the known deepest depth
        depth > totalHeaderRows && (totalHeaderRows = depth);

        // Get all of the children of this Progression Level
        var childrenURIs = PathwayViewer.normalizeArrayValue(Level["skos:narrower"]);
        var children = Viewer.Data.AllProgressionLevels.filter(OtherLevel => childrenURIs.includes(OtherLevel["@id"]) || PathwayViewer.normalizeArrayValue(OtherLevel["skos:broader"]).includes(Level["@id"]));

        // Update the UI Level
        RenderedLevel.RenderedChildLevels = children.map(ChildLevel => Viewer.UI.ProgressionLevels.find(RenderedLevel => RenderedLevel.ProgressionLevel == ChildLevel));
        RenderedLevel.Depth = depth;
        RenderedLevel.LocalColumnOffset = localColumnOffset;
        parentRenderedLevels.forEach(parentRenderedLevel => parentRenderedLevel.ColSpan += children.length);
        
        // Dive one level deeper
        children.forEach((ChildLevel, index) => {
            Level.Meta.ColSpan += dive(ChildLevel, depth + 1, [...parentRenderedLevels, RenderedLevel], index);
        });
    }
}

PathwayViewer.renderProgressionLevel = function(Viewer, RenderedTopLevel, Level){
    // Find the corresponding Rendered Level for this Level
    var RenderedLevel = Viewer.UI.ProgressionLevels.find(RenderedLevel => RenderedLevel.ProgressionLevel == Level);

    // Create the header cell for this Level and leverage its ColSpan and Depth
    var headerCell = PathwayViewer.createTag("th", "pathwayViewer progressionModelTableHeaderCell", { "colspan": RenderedLevel.ColSpan }).appendTo(Viewer.UI.THeadRows[RenderedLevel.Depth]);

    // Create the inner content wrapper for the header cell
    RenderedLevel.HeaderCellInner = PathwayViewer.createTag("div", "pathwayViewer progressionModelTableHeaderCellInner").appendTo(headerCell);
    RenderedLevel.HeaderCellInner.innerHTML = Viewer.getText(Level["skos:prefLabel"]);

    // Find or render a body cell for this level based on its column offset
    RenderedLevel.BodyCell = RenderedTopLevel.BodyColumns[RenderedLevel.LocalColumnOffset];
    RenderedLevel.BodyInner = RenderedTopLevel.BodyInners[RenderedLevel.LocalColumnOffset];
    if(!RenderedLevel.BodyCell){
        RenderedLevel.BodyCell = PathwayViewer.createTag("td", "pathwayViewer progressionModelTableBodyCell").appendTo(Viewer.UI.TBodyRow);
        RenderedTopLevel.BodyColumns.push(RenderedLevel.BodyCell);
        RenderedLevel.BodyInner = PathwayViewer.createTag("div", "pathwayViewer progressionModelTableBodyCellInner").appendTo(RenderedLevel.BodyCell);
        RenderedTopLevel.BodyInners.push(RenderedLevel.BodyInner);
    }

    // Find all of the Components that reference this Level and figure out how many offset columns we need
    var totalOffsets = 0;
    var levelComponents = Viewer.Data.Components.filter(Component => PathwayViewer.normalizeArrayValue(Component["asn:hasProgressionLevel"]).includes(Level["@id"]));
    levelComponents.forEach(Component => {
        trace(Component, 0, []);
    });

    // Add offset columns within this Level's BodyInner
    RenderedLevel.OffsetColumns = {};
    var offsetCounter = totalOffsets;
    while(offsetCounter >= 0){
        RenderedLevel.OffsetColumns[offsetCounter] = PathwayViewer.createTag("div", "pathwayViewer progressionModelOffsetColumn orderableNodeList", { "data-offset": offsetCounter }).appendTo(RenderedLevel.BodyInner);
        offsetCounter--;
    }

    // Set the Destination Component's offset to 0
    Viewer.Data.DestinationComponent.RenderColumnOffset = 0;

    // Helper function to crawl a Component's required/previous Component heirarchy within this Level
    function trace(Component, offset, visited){
        // Update the max offset if it's larger than what's been encountered so far
        offset > totalOffsets && (totalOffsets = offset);

        // Set or update the Component's own offset if it's larger than what the Component has encountered so far
        Component.RenderColumnOffset = (!Component.RenderColumnOffset || offset > Component.RenderColumnOffset) ? offset : Component.RenderColumnOffset;

        // Get the components in this Level that should be rendered to the left of this Component
        var requiredURIs = getRequiredComponentURIs(Component);
        var precededByURIs = PathwayViewer.normalizeArrayValue(Component["ceterms:precededBy"]);
        var hasChildURIs = PathwayViewer.normalizeArrayValue(Component["ceterms:hasChild"]);
        var previousComponents = levelComponents.filter(OtherComponent => 
            requiredURIs.includes(OtherComponent["@id"]) ||
            precededByURIs.includes(OtherComponent["@id"]) ||
            hasChildURIs.includes(OtherComponent["@id"]) ||
            PathwayViewer.normalizeArrayValue(OtherComponent["ceterms:precedes"]).includes(Component["@id"]) ||
            PathwayViewer.normalizeArrayValue(OtherComponent["ceterms:isChildOf"]).includes(Component["@id"])
        );

        // For each such preceding Component...
        previousComponents.forEach(PreviousComponent => {
            // If this path has already been traced, log an error and abort
            if(visited.find(item => item.from == Component && item.to == PreviousComponent)){
                Viewer.addError(`Possible circular reference detected in Component precededBy/hasChild/precedes/isChildOf path`, { Viewer: Viewer, Component: Component, PreviousComponent: PreviousComponent });
                return;
            }

            // Track it
            visited.push({ from: Component, to: PreviousComponent });
            
            // Trace its requirements
            trace(PreviousComponent, offset + 1, visited);
        });
    }

    // Helper function to crawl a Component's requirements heirarchy and get all of those Components
    function getRequiredComponentURIs(Component){
        var result = [];
        PathwayViewer.normalizeArrayValue(Component["ceterms:hasCondition"]).forEach(crawlCondition);
        return result.filter((item, index, array) => array.indexOf(item) == index);

        function crawlCondition(Condition){
            result = result.concat(PathwayViewer.normalizeArrayValue(Condition["ceterms:targetComponent"]));
            PathwayViewer.normalizeArrayValue(Condition["ceterms:hasCondition"]).forEach(crawlCondition);
        }
    }
}

// Render a component, and recursively render its children
PathwayViewer.renderComponent = async function(Viewer, Component){
    // Skip and log error if this Component has already been rendered
    if(Viewer.UI.RenderedComponents.find(RenderedComponent => RenderedComponent.Component == Component)){
        Viewer.addError(`Unexpected call to render a Component more than once, rendering skipped`, { Viewer: Viewer, Component: Component });
        return;
    }
    
    // Find the Progression Level to target
    var targetProgressionLevel = Viewer.UI.ProgressionLevels.find(RenderedLevel => RenderedLevel.ProgressionLevel["@id"] == PathwayViewer.normalizeArrayValue(Component["asn:hasProgressionLevel"])[0]);
    if(!targetProgressionLevel){
        Viewer.addError(`Unable to find rendered Progression Level for Component ${Component["ceterms:ctid"]}.`, { Viewer: Viewer, Component: Component });
        return;
    }

    // Setup the structure
    var RenderedComponent = {
        Component: Component,
        RenderedConditions: [],
        RenderedPrecedingComponents: [],
        RenderedChildComponents: [],
        Wrapper: PathwayViewer.createTag("div", "pathwayViewer componentWrapper", { "data-type": Component["@type"] }).appendTo(targetProgressionLevel.OffsetColumns[Component.RenderColumnOffset])
    };
    RenderedComponent.ChildConditions = PathwayViewer.createTag("div", "pathwayViewer childConditions orderableNodeList").appendTo(RenderedComponent.Wrapper);
    RenderedComponent.Display = PathwayViewer.createTag("div", "pathwayViewer pathwayDisplay componentDisplay").appendTo(RenderedComponent.Wrapper);
    RenderedComponent.Header = PathwayViewer.createTag("div", "pathwayViewer pathwayDisplaySection pathwayDisplayHeader componentDisplayHeader").appendTo(RenderedComponent.Display);
    RenderedComponent.Body = PathwayViewer.createTag("div", "pathwayViewer pathwayDisplaySection pathwayDisplayBody componentDisplayBody").appendTo(RenderedComponent.Display);
    RenderedComponent.ReferencedConditions = PathwayViewer.createTag("div", "pathwayViewer pathwayDisplaySection pathwayDisplayConnection componentDisplayConditions").appendTo(RenderedComponent.Display);
    RenderedComponent.ReferencedPrecededBy = PathwayViewer.createTag("div", "pathwayViewer pathwayDisplaySection pathwayDisplayConnection componentDisplayPrecededBy").appendTo(RenderedComponent.Display);
    RenderedComponent.ReferencedChildren = PathwayViewer.createTag("div", "pathwayViewer pathwayDisplaySection pathwayDisplayConnection componentDisplayChildren").appendTo(RenderedComponent.Display);
    RenderedComponent.Links = PathwayViewer.createTag("div", "pathwayViewer pathwayDisplaySection pathwayDisplayLinks componentDisplayLinks").appendTo(RenderedComponent.Display);
    RenderedComponent.Footer = PathwayViewer.createTag("div", "pathwayViewer pathwayDisplaySection pathwayDisplayFooter componentDisplayFooter").appendTo(RenderedComponent.Display);

    // Track the Component
    Viewer.UI.RenderedComponents.push(RenderedComponent);

    // Credential Type, if applicable
    Component["ceterms:credentialType"] && RenderedComponent.Wrapper.setAttribute("data-credentialtype", Component["ceterms:credentialType"]);

    // Name and Focus Button
    PathwayViewer.createTag("span", "label").appendTo(RenderedComponent.Header).appendText(Viewer.getText(Component["ceterms:name"]));
    PathwayViewer.createTag("button", "pathwayViewer pathwayDisplayButton focusButton").appendTo(RenderedComponent.Header).appendText("Focus").addEventListener("click", function() {
        PathwayViewer.highlightNodeTreeFromNode(Viewer, RenderedComponent);
    });

    // Link to the Component, if applicable
    if(RenderedComponent.Component["@id"].startsWith("http")){
        var ctid = RenderedComponent.Component["@id"].split("/").find(m => m.startsWith("ce-")) || "";
        Viewer.Options.UI.ComponentURILinks.forEach(linkPattern => {
            var href = linkPattern.URIPattern.replace(/{uri}/g, RenderedComponent.Component["@id"]).replace(/{ctid}/g, ctid);
            PathwayViewer.createTag("a", "", { "href": href, "target": "_blank" }).appendTo(RenderedComponent.Links).appendText(Viewer.getText(linkPattern.Label));
        });
    }

    // Link to the Proxy For value(s), if applicable
    var proxyForLinks = PathwayViewer.normalizeArrayValue(Component["ceterms:proxyForList"] || Component["ceterms:proxyFor"]).map(link => {
        var ctid = link.split("/").find(m => m.startsWith("ce-")) || "";
        return { uri: link, ctid: ctid };
    });
    Viewer.Options.UI.ComponentProxyForLinks.forEach(linkPattern => {
        proxyForLinks.forEach(proxyFor => {
            var href = linkPattern.URIPattern.replace(/{uri}/g, proxyFor.uri).replace(/{ctid}/g, proxyFor.ctid);
            PathwayViewer.createTag("a", "", { "href": href, "target": "_blank" }).appendTo(RenderedComponent.Links).appendText(`${Viewer.getText(linkPattern.Label)}${proxyFor.length > 1 ? `: ${proxyFor.ctid}` : ""}`);
        });
    });

    // Body
    RenderedComponent.Body.innerHTML = Viewer.getText(Component["ceterms:description"], "description");

    // Footer
    RenderedComponent.Footer.innerHTML = `<div class="type">${Component["@type"]}</div><div class="ctid">${Component["ceterms:ctid"] || ""}</div>`;

    // Render the requirements
    var hasCondition = PathwayViewer.normalizeArrayValue(Component["ceterms:hasCondition"]);
    await hasCondition.forEach(async Condition => {
        await PathwayViewer.renderComponentCondition(Viewer, RenderedComponent, Condition);
    });
    RenderedComponent.ReferencedConditions.innerHTML = hasCondition.length == 0 ? "" : `${hasCondition.length} Condition${hasCondition.length == 1 ? "" : "s"}`;
    RenderedComponent.ReferencedConditions.setAttribute("data-total", hasCondition.length);

    // Store a reference to any preceding Components, and render them if they haven't already been rendered
    var precededBy = PathwayViewer.normalizeArrayValue(Component["ceterms:precededBy"]);
    var precedingComponents = Viewer.Data.Components.filter(OtherComponent => precededBy.includes(OtherComponent["@id"]) || PathwayViewer.normalizeArrayValue(OtherComponent["ceterms:precedes"]).includes(Component["@id"]));
    await precedingComponents.forEach(async PrecedingComponent => {
        RenderedComponent.RenderedPrecedingComponents.push(
            Viewer.UI.RenderedComponents.find(OtherRenderedComponent => OtherRenderedComponent.Component == PrecedingComponent) ||
            await PathwayViewer.renderComponent(Viewer, PrecedingComponent)
        );
    });
    RenderedComponent.ReferencedPrecededBy.innerHTML = precedingComponents.length == 0 ? "" : `${precedingComponents.length} Component${precedingComponents.length == 1 ? "" : "s"} directly precede${precedingComponents.length == 1 ? "s" : ""} this one`;
    RenderedComponent.ReferencedPrecededBy.setAttribute("data-total", precedingComponents.length);

    // Store a reference to any child Components, and render them if they haven't already been rendered
    var children = PathwayViewer.normalizeArrayValue(Component["hasChild"]);
    var childComponents = Viewer.Data.Components.filter(OtherComponent => children.includes(OtherComponent["@id"]) || PathwayViewer.normalizeArrayValue(OtherComponent["ceterms:isChildOf"]).includes(Component["@id"]));
    await childComponents.forEach(async ChildComponent => {
        RenderedComponent.RenderedChildComponents.push(
            Viewer.UI.RenderedComponents.find(OtherRenderedComponent => OtherRenderedComponent.Component == ChildComponent) ||
            await PathwayViewer.renderComponent(Viewer, ChildComponent)
        );
    });
    RenderedComponent.ReferencedChildren.innerHTML = childComponents.length == 0 ? "" : `${childComponents.length} Child Component${childComponents.length == 1 ? "" : "s"}`;
    RenderedComponent.ReferencedChildren.setAttribute("data-total", childComponents.length);

    // Return it
    return RenderedComponent;
}

// Render a Component Condition
PathwayViewer.renderComponentCondition = async function(Viewer, RenderedParent, Condition){
    // Setup the structure
    var RenderedCondition = {
        Condition: Condition,
        RenderedConditions: [],
        RenderedTargetComponents: [],
        Wrapper: PathwayViewer.createTag("div", "pathwayViewer conditionWrapper").appendTo(RenderedParent.ChildConditions)
    };
    RenderedCondition.ChildConditions = PathwayViewer.createTag("div", "pathwayViewer childConditions").appendTo(RenderedCondition.Wrapper);
    RenderedCondition.Display = PathwayViewer.createTag("div", "pathwayViewer pathwayDisplay conditionDisplay").appendTo(RenderedCondition.Wrapper);
    RenderedCondition.Header = PathwayViewer.createTag("div", "pathwayViewer pathwayDisplaySection pathwayDisplayHeader conditionDisplayHeader").appendTo(RenderedCondition.Display);
    RenderedCondition.Body = PathwayViewer.createTag("div", "pathwayViewer pathwayDisplaySection pathwayDisplayBody conditionDisplayBody").appendTo(RenderedCondition.Display);
    RenderedCondition.ReferencedConditions = PathwayViewer.createTag("div", "pathwayViewer pathwayDisplaySection pathwayDisplayConnection conditionDisplayConditions").appendTo(RenderedCondition.Display);
    RenderedCondition.ReferencedComponents = PathwayViewer.createTag("div", "pathwayViewer pathwayDisplaySection pathwayDisplayConnection conditionDisplayComponents").appendTo(RenderedCondition.Display);
    RenderedCondition.Footer = PathwayViewer.createTag("div", "pathwayViewer pathwayDisplaySection pathwayDisplayFooter conditionDisplayFooter").appendTo(RenderedCondition.Display);
    RenderedCondition.RequirementsBox = PathwayViewer.createTag("div", "pathwayViewer conditionRequirementsBox").appendTo(RenderedCondition.Display);

    // Track it
    RenderedParent.RenderedConditions.push(RenderedCondition);
    Viewer.UI.RenderedConditions.push(RenderedCondition);

    // Populate the content
    var totalReferencedItems = (Condition["ceterms:targetComponent"]?.length || 0) + (Condition["ceterms:hasCondition"]?.length || 0);
    RenderedCondition.RequirementsBox.innerHTML = `${Condition["ceterms:requiredNumber"] || "0"} / ${totalReferencedItems}`;
    RenderedCondition.RequirementsBox.title = `Requires at least ${Condition["ceterms:requiredNumber"] || "0"} of ${totalReferencedItems} Components and/or Sub-Conditions`;
    PathwayViewer.createTag("span", "label").appendTo(RenderedCondition.Header).appendText(Viewer.getText(Condition["ceterms:name"]) || "Condition");
    PathwayViewer.createTag("button", "pathwayViewer pathwayDisplayButton focusButton").appendTo(RenderedCondition.Header).appendText("Focus").addEventListener("click", function() {
        PathwayViewer.highlightNodeTreeFromNode(Viewer, RenderedCondition);
    });
    RenderedCondition.Body.innerHTML = Viewer.getText(Condition["ceterms:description"], "description");
   
    // Render sub-Conditions
    var hasCondition = PathwayViewer.normalizeArrayValue(Condition["ceterms:hasCondition"]);
    await hasCondition.forEach(async OtherCondition => {
        await PathwayViewer.renderComponentCondition(Viewer, RenderedCondition, OtherCondition);
    });
    RenderedCondition.ReferencedConditions.innerHTML = hasCondition.length == 0 ? "" : `${hasCondition.length} Sub-Conditions`;
    RenderedCondition.ReferencedConditions.setAttribute("data-total", hasCondition.length);

    // Render target Components
    var targetComponents = PathwayViewer.normalizeArrayValue(Condition["ceterms:targetComponent"]);
    await targetComponents.forEach(async targetComponentURI => {
        // Find the Component
        var TargetComponent = Viewer.Data.Components.find(OtherComponent => OtherComponent["@id"] == targetComponentURI);
        if(!TargetComponent){
            Viewer.addError(`Component Condition references target Component ${targetComponentURI}, which was not found in this Pathway.`);
            return;
        }

        // Find or render the Component and store a reference to it
        RenderedCondition.RenderedTargetComponents.push(
            Viewer.UI.RenderedComponents.find(RenderedComponent => RenderedComponent.Component == TargetComponent) || 
            await PathwayViewer.renderComponent(Viewer, TargetComponent)
        );
    });
    RenderedCondition.ReferencedComponents.innerHTML = targetComponents.length == 0 ? "" : `${targetComponents.length} Components`;
    RenderedCondition.ReferencedComponents.setAttribute("data-total", targetComponents.length);

    // Return it
    return RenderedCondition;
}

// Render arrows for a Viewer
PathwayViewer.renderConnectors = async function(Viewer){
    // Set and clear the canvases
	Viewer.UI.CanvasCell = Viewer.UI.CanvasCell || PathwayViewer.createTag("th", "canvasCell").appendTo(PathwayViewer.createTag("tr", "canvasRow").appendTo(Viewer.UI.THead));
    Viewer.UI.BottomCanvas = Viewer.UI.BottomCanvas || PathwayViewer.createTag("canvas", "pathwayViewer lineCanvas bottomCanvas").appendTo(Viewer.UI.CanvasCell);
    Viewer.UI.TopCanvas = Viewer.UI.TopCanvas || PathwayViewer.createTag("canvas", "pathwayViewer lineCanvas topCanvas").appendTo(Viewer.UI.CanvasCell);
    Viewer.UI.HighlightCanvas = Viewer.UI.HighlightCanvas || PathwayViewer.createTag("canvas", "pathwayViewer lineCanvas highlightCanvas").appendTo(Viewer.UI.CanvasCell);
    var bottomContext = setupCanvas(Viewer.UI.BottomCanvas);
    var topContext = setupCanvas(Viewer.UI.TopCanvas);
    var highlightContext = setupCanvas(Viewer.UI.HighlightCanvas);

    // Draw the lines
    var allStops = [];
    PathwayViewer.drawLines(Viewer, bottomContext, Viewer.UI.RenderedComponents.find(RenderedComponent => RenderedComponent.Component == Viewer.Data.DestinationComponent), [], allStops, highlightContext);
    var filteredStops = [];
    allStops.forEach(stop => {
        !filteredStops.find(item => item.x == stop.x && item.y == stop.y) && filteredStops.push(stop);
    });

    // Draw the connection points for each relevant node on top of the lines
    Array.from(Viewer.UI.TBody.querySelectorAll(".pathwayDisplayConnection:not([data-total='0'])")).forEach(node => {
        var points = Viewer.getContentNodePosition(node);
        drawDot(points.LeftCenter.x, points.LeftCenter.y, getComputedStyle(node).getPropertyValue("--connection-node-color"));
    });

    filteredStops.forEach(stop => drawDot(stop.x, stop.y, stop.color));

    function setupCanvas(Canvas){
        Canvas.setAttribute("width", Viewer.UI.Content.scrollWidth);
        Canvas.setAttribute("height", Viewer.UI.Content.scrollHeight);
        var context = Canvas.getContext("2d");
        context.clearRect(0, 0, Viewer.UI.Content.scrollWidth, Viewer.UI.Content.scrollHeight);
        return context;
    }

    function drawDot(x, y, color){
        topContext.beginPath();
        topContext.arc(x, y, 5, 0, Math.PI * 2, false);
        topContext.fillStyle = color || "#CCC";
        topContext.fill();
    }
}

PathwayViewer.drawLines = function(Viewer, context, Source, visited, allStops, highlightContext){
    // Avoid infinite loop
    if(visited.includes(Source)){
        return;
    }
    visited.push(Source);

    Source.RenderedChildComponents?.forEach(RenderedChild => {
        drawLine(Viewer.getContentNodePosition(Source.ReferencedChildren).LeftCenter, Viewer.getContentNodePosition(RenderedChild.Display).RightCenter, Source.ReferencedChildren);
        PathwayViewer.drawLines(Viewer, context, RenderedChild, visited, allStops, highlightContext);
    });
    Source.RenderedConditions?.forEach(RenderedCondition => {
        drawLine(Viewer.getContentNodePosition(Source.ReferencedConditions).LeftCenter, Viewer.getContentNodePosition(RenderedCondition.Display).RightCenter, Source.ReferencedConditions);
        PathwayViewer.drawLines(Viewer, context, RenderedCondition, visited, allStops, highlightContext);
    });
    Source.RenderedPrecedingComponents?.forEach(RenderedPreceding => {
        drawLine(Viewer.getContentNodePosition(Source.ReferencedPrecededBy).LeftCenter, Viewer.getContentNodePosition(RenderedPreceding.Display).RightCenter, Source.ReferencedPrecededBy);
        PathwayViewer.drawLines(Viewer, context, RenderedPreceding, visited, allStops, highlightContext);
    });
    Source.RenderedTargetComponents?.forEach(RenderedTarget => {
        drawLine(Viewer.getContentNodePosition(Source.ReferencedComponents).LeftCenter, Viewer.getContentNodePosition(RenderedTarget.Display).RightCenter, Source.ReferencedComponents);
        PathwayViewer.drawLines(Viewer, context, RenderedTarget, visited, allStops, highlightContext);
    });

    function drawLine(from, to, styleFromComponent){
        var color = getComputedStyle(styleFromComponent).getPropertyValue("--connection-node-color") || "#CCC";
        draw(context);
        allStops.push({ x: to.x, y: to.y, color: color });
        if(Source.IsHighlighted){
            draw(highlightContext);
        }
        
        function draw(lineContext){
            lineContext.beginPath();
            lineContext.moveTo(from.x, from.y);
            lineContext.bezierCurveTo(from.x - 75, from.y, to.x + 75, to.y, to.x, to.y);
            lineContext.strokeStyle = color;
            lineContext.lineWidth = Source.IsHighlighted ? 3 : 1;
            lineContext.shadowColor = Source.IsHighlighted ? color : "transparent";
            lineContext.shadowBlur = Source.IsHighlighted ? 10 : 0;
            lineContext.stroke();
        }
    }
}

PathwayViewer.clearAllHighlights = function(Viewer){
    Viewer.UI.HighlightStartNode = null;
    Viewer.UI.RenderedComponents.concat(Viewer.UI.RenderedConditions).forEach(RenderedNode => { 
        RenderedNode.IsHighlighted = false;
        RenderedNode.Wrapper.setAttribute("data-ishighlighted", "false");
    });
    PathwayViewer.renderConnectors(Viewer);
}

PathwayViewer.highlightNodeTreeFromNode = function(Viewer, RenderedNode){
    var scrollLeft = Viewer.UI.Content.scrollLeft;
    var scrollTop = Viewer.UI.Content.scrollTop;
    // If the node is already highlighted and is the starting node for highlights, just clear all of the highlights
    if(Viewer.UI.HighlightStartNode == RenderedNode && RenderedNode.IsHighlighted){
        PathwayViewer.clearAllHighlights(Viewer);
    }
    // Otherwise, clear highlights and start highlighting from this node
    else{
        PathwayViewer.clearAllHighlights(Viewer);
        Viewer.UI.HighlightStartNode = RenderedNode;
        PathwayViewer.highlightNextNode(RenderedNode, []);
    }
    PathwayViewer.renderConnectors(Viewer);
    Viewer.UI.Content.scrollLeft = scrollLeft;
    Viewer.UI.Content.scrollTop = scrollTop;
}

PathwayViewer.highlightNextNode = function(RenderedNode, visited){
    if(visited.includes(RenderedNode)){
        return;
    }
    visited.push(RenderedNode);

    RenderedNode.IsHighlighted = true;
    RenderedNode.Wrapper.setAttribute("data-ishighlighted", "true");
    RenderedNode.RenderedChildComponents?.forEach(ChildNode => PathwayViewer.highlightNextNode(ChildNode, visited));
    RenderedNode.RenderedPrecedingComponents?.forEach(ChildNode => PathwayViewer.highlightNextNode(ChildNode, visited));
    RenderedNode.RenderedConditions?.forEach(ChildNode => PathwayViewer.highlightNextNode(ChildNode, visited));
    RenderedNode.RenderedTargetComponents?.forEach(ChildNode => PathwayViewer.highlightNextNode(ChildNode, visited));
}

// Ensure a set of basic styles are present
// These are intended to be easy to override if desired
PathwayViewer.ensureStyles = function(){
    if(document.querySelector("#pathwayViewerStyleBlock")){
        return;
    }

    var styleTag = PathwayViewer.createTag("style", "", { "id": "pathwayViewerStyleBlock" });
    styleTag.innerHTML = `
        .pathwayViewer, .pathwayViewer * { box-sizing: border-box; }
        .pathwayViewer.langString .langCode { display: none; }
        .pathwayViewer.pathwayHeader { font-family: Calibri, Tahoma, Arial, Helvetica, Sans-serif; }
        .pathwayViewer.pathwayContent { box-sizing: border-box; display: flex; position: relative; font-family: Calibri, Tahoma, Arial, Helvetica, Sans-serif; margin: 0; padding: 0; background-color: #EEE; overflow: auto; max-width: 100vw; max-height: calc(100vh - 50px); }
        .pathwayViewer.pathwayMessages { font-family: Calibri, Tahoma, Arial, Helvetica, Sans-serif; }
        .pathwayViewer.progressionModelTable { width: 100%; border-collapse: collapse; }
        .pathwayViewer.progressionModelTableHeaderCell { font-weight: bold; font-size: 120%; background-color: #333; color: #FFF; padding: 5px 10px; min-width: 550px; border-right: 1px solid #FFF; &:last-child { border-right: none; } position: sticky; top: 0; z-index: 100; }
        .pathwayViewer.progressionModelTableBodyCell { vertical-align: top; border-right: 1px dashed #333; &:last-child { border-right: none; } }
        .pathwayViewer.progressionModelTableBodyCellInner { display: flex; justify-content: flex-end; position: relative; z-index: 10; }
        .pathwayViewer.lineCanvas { position: absolute; top: 0; left: 0; pointer-events: none; }
        .pathwayViewer.lineCanvas.bottomCanvas { z-index: 1; }
        .pathwayViewer.lineCanvas.topCanvas { z-index: 20; }
        .pathwayViewer.lineCanvas.highlightCanvas { z-index: 20; opacity: 0.5; }

        .pathwayViewer.orderableNodeList { display: flex; flex-direction: column; }
        .pathwayViewer.pathwayDisplay { width: 500px; margin: 50px 100px; background-color: #FFF; border: 1px solid #CCC; border-radius: 5px; overflow: hidden; }
        .pathwayViewer.pathwayDisplaySection { border-top: 1px solid #CCC; &:first-child { border: none; } &:empty { display: none; } }
        .pathwayViewer.pathwayDisplayConnection { padding: 5px 10px; }
        .pathwayViewer.pathwayDisplayLinks { padding: 5px 10px; }
        .pathwayViewer.pathwayDisplayLinks a { display: block; text-decoration: none; &:is(:hover, :focus) { text-decoration: underline; } }

        .pathwayViewer.componentWrapper { display: flex; align-items: center; justify-content: flex-end; order: 1; }
        .pathwayViewer.componentWrapper[data-ishighlighted='true'] { order: 0; }
        .pathwayViewer.componentDisplay {  }
        .pathwayViewer.componentWrapper[data-ishighlighted='true'] .componentDisplay { box-shadow: 0 0 10px #0FA; }
        .pathwayViewer.componentDisplayHeader { display: flex; gap: 10px; align-items: center; padding: 5px 10px; font-weight: bold; }
        .pathwayViewer.componentDisplayHeader .label { margin-right: auto; }
        .pathwayViewer.componentDisplayBody { padding: 5px 10px; }
        .pathwayViewer.componentDisplayFooter { padding: 5px; text-align: right; font-size: 80%; }
        .pathwayViewer.pathwayDisplayConnection { border-color: #CCC; --connection-node-color: #BBB; }
        .pathwayViewer.pathwayDisplayConnection.componentDisplayConditions { --connection-node-color: #FA0; }
        .pathwayViewer.pathwayDisplayConnection.componentDisplayPrecededBy { --connection-node-color: #0C3; }
        .pathwayViewer.pathwayDisplayConnection.componentDisplayChildren { --connection-node-color: #CCC; }
        .pathwayViewer.componentDisplayHeader .pathwayDisplayButton { background-color: #AFD; border: 1px solid #0CA; border-radius: 3px; &:is(:focus, :hover) { cursor: pointer; background-color: #BFE; } }

        .pathwayViewer.childConditions {  }

        .pathwayViewer.conditionWrapper { display: flex; align-items: center; justify-content: flex-end; order: 1; }
        .pathwayViewer.conditionWrapper[data-ishighlighted='true'] { order: 0; }
        .pathwayViewer.conditionDisplay { display: grid; grid-template-columns: 1fr minmax(0, auto); background-color: #FFFFEE; border-color: #EEDDCC; }
        .pathwayViewer.conditionWrapper[data-ishighlighted='true'] .conditionDisplay { box-shadow: 0 0 10px #FA0; }
        .pathwayViewer.conditionDisplay .conditionRequirementsBox { grid-column-start: 2; grid-row-start: 1; grid-row-end: 10; align-content: center; padding: 10px; height: 100%; border-left: 1px solid #EEDDCC; font-weight: bold; font-size: 120%; white-space: nowrap; cursor: help; background-color: #FFFFCC; &:empty { display: none; } }
        .pathwayViewer.conditionDisplayHeader { display: flex; gap: 10px; align-items: center; padding: 5px 10px; font-weight: bold; }
        .pathwayViewer.conditionDisplayHeader .label { margin-right: auto; }
        .pathwayViewer.conditionDisplayBody { padding: 5px 10px; &:empty { display: none; } }
        .pathwayViewer.conditionDisplayFooter { padding: 5px; &:empty { display: none; } }
        .pathwayViewer.conditionDisplay .pathwayDisplaySection { border-color: #EEDDCC; }
        .pathwayViewer.conditionDisplay .pathwayDisplayConnection { --connection-node-color: #FA0; }
        .pathwayViewer.pathwayDisplayConnection.conditionDisplayComponents { border-color: #EEDDCC; --connection-node-color: #03A; }
        .pathwayViewer.pathwayDisplayConnection.conditionDisplayConditions { border-color: #EEDDCC; --connection-node-color: #FA0; }
        .pathwayViewer.conditionDisplayHeader .pathwayDisplayButton { background-color: #FDA; border: 1px solid #FA0; border-radius: 3px; &:is(:focus, :hover) { cursor: pointer; background-color: #FEB; } }
    `;
    styleTag.appendTo(document.body);
}