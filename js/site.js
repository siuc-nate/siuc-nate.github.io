const Site = {};

Site.createTag = function(tag, className, attributes){
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
};

Site.setup = function(base){
    Site.Base = base;
    Site.createTag("link", "", { rel: "stylesheet", href: `${base}/css/site.css` }).appendTo(document.head);
    Site.Header = document.querySelector(".site.header");
    Site.Navbar = Site.createTag("div", "site navbar").appendTo(Site.Header);
    [
        { url: "/index.html", label: "Home" },
        { url: "/pathwayviewer/index.html", label: "Pathway Viewer Demo" }
    ].forEach(link => {
        Site.createTag("a", "", { href: `${base}${link.url}` }).appendTo(Site.Navbar).appendText(link.label);
    });
    
    Site.Body = document.querySelector(".site.body");
    Site.Footer = document.querySelector(".site.footer");
};

