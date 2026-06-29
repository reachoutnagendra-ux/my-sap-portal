sap.ui.define(
  [
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "sap/ui/model/json/JSONModel",
    "sap/favorites/model/models"
  ],
  function (UIComponent, Device, JSONModel, models) {
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
            siteTitle: "My SAP Portal",
            profile: { name: "", title: "", avatar: "" }
          }),
          "app"
        );

        // Load the owner's profile (name/title/avatar) for the header.
        this._loadProfile();

        this.getRouter().initialize();
      },

      _loadProfile: function () {
        var oApp = this.getModel("app");
        models
          .getProfile()
          .then(function (profile) {
            oApp.setProperty("/profile", {
              name: (profile && profile.name) || "",
              title: (profile && profile.title) || "",
              avatar: (profile && profile.avatar) || ""
            });
          })
          .catch(function () {
            /* no backend (static mode) or not configured yet — leave defaults */
          });
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
