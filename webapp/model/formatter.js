sap.ui.define([], function () {
  "use strict";

  var TYPE_META = {
    "sap-blog": { label: "SAP Blog", color: "#0070F2" },
    "learning-hub": { label: "Learning Hub", color: "#E76500" },
    github: { label: "GitHub", color: "#8B949E" },
    youtube: { label: "YouTube", color: "#FF0000" },
    "sap-help": { label: "SAP Help", color: "#188918" },
    other: { label: "Link", color: "#6E6E6E" }
  };

  return {
    typeLabel: function (type) {
      var m = TYPE_META[type] || TYPE_META.other;
      return m.label;
    },

    typeColor: function (type) {
      var m = TYPE_META[type] || TYPE_META.other;
      return m.color;
    },

    // Pick the best preview image: image first, then favicon, then placeholder.
    previewSrc: function (imageUrl, faviconUrl) {
      return imageUrl || faviconUrl || "";
    },

    hasImage: function (imageUrl, faviconUrl) {
      return !!(imageUrl || faviconUrl);
    },

    tagsText: function (tags) {
      if (!tags || !tags.length) {
        return "";
      }
      return tags
        .map(function (t) {
          return "#" + t;
        })
        .join("  ");
    },

    // Up to two initials from a person's name, for the avatar fallback.
    initials: function (name) {
      if (!name) {
        return "";
      }
      var parts = String(name).trim().split(/\s+/).filter(Boolean);
      if (!parts.length) {
        return "";
      }
      var first = parts[0].charAt(0);
      var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
      return (first + last).toUpperCase();
    }
  };
});
