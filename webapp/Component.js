sap.ui.define(
  ["sap/ui/core/UIComponent", "sap/ui/Device", "sap/ui/model/json/JSONModel"],
  function (UIComponent, Device, JSONModel) {
    "use strict";

    return UIComponent.extend("sap.favorites.Component", {
      metadata: {
        manifest: "json"
      },

      init: function () {
        UIComponent.prototype.init.apply(this, arguments);

        // Device model for responsive bindings.
        this.setModel(new JSONModel(Device), "device");

        // Global app state: auth token, site title.
        var sAuth = "";
        try {
          sAuth = window.localStorage.getItem("favorites_token") || "";
        } catch (e) {
          sAuth = "";
        }
        this.setModel(
          new JSONModel({
            token: sAuth,
            isAdmin: !!sAuth,
            siteTitle: "My SAP Portal"
          }),
          "app"
        );

        this.getRouter().initialize();
      },

      getContentDensityClass: function () {
        if (this._sContentDensityClass === undefined) {
          this._sContentDensityClass = Device.support.touch
            ? "sapUiSizeCozy"
            : "sapUiSizeCompact";
        }
        return this._sContentDensityClass;
      }
    });
  }
);
