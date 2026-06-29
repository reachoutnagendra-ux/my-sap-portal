sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/favorites/model/models",
    "sap/favorites/model/formatter",
    "sap/m/MessageToast"
  ],
  function (Controller, JSONModel, models, formatter, MessageToast) {
    "use strict";

    // Keep avatars small: ~1 MB source cap mirrors the server-side limit.
    var MAX_FILE_BYTES = 1024 * 1024;

    return Controller.extend("sap.favorites.controller.AdminProfile", {
      formatter: formatter,

      onInit: function () {
        // Local editing model `p` so edits don't mutate the live header until saved.
        this._p = new JSONModel({ name: "", title: "", avatar: "" });
        this.getView().setModel(this._p, "p");

        this._loadProfile();

        // Reload after a late login (sub-views render before auth completes).
        var oBus = this.getOwnerComponent().getEventBus();
        oBus.subscribe("admin", "loggedIn", this._loadProfile, this);
      },

      onExit: function () {
        this.getOwnerComponent()
          .getEventBus()
          .unsubscribe("admin", "loggedIn", this._loadProfile, this);
      },

      _loadProfile: function () {
        var that = this;
        models
          .getProfile()
          .then(function (profile) {
            that._p.setData({
              name: (profile && profile.name) || "",
              title: (profile && profile.title) || "",
              avatar: (profile && profile.avatar) || ""
            });
          })
          .catch(function () {
            /* not configured yet — keep blank */
          });
      },

      onPickAvatar: function (oEvent) {
        var oFile = oEvent.getParameter("files") && oEvent.getParameter("files")[0];
        var oUploader = oEvent.getSource();
        if (!oFile) {
          return;
        }
        if (oFile.size > MAX_FILE_BYTES) {
          MessageToast.show("Image is too large (max ~1 MB).");
          oUploader.clear();
          return;
        }
        var that = this;
        var oReader = new FileReader();
        oReader.onload = function (e) {
          that._p.setProperty("/avatar", e.target.result); // data URL
        };
        oReader.onerror = function () {
          MessageToast.show("Could not read the image file.");
        };
        oReader.readAsDataURL(oFile);
        oUploader.clear();
      },

      onRemoveAvatar: function () {
        this._p.setProperty("/avatar", "");
      },

      onSave: async function () {
        var data = this._p.getData();
        if (!data.name || !data.name.trim()) {
          MessageToast.show("Please enter a name.");
          return;
        }
        try {
          var saved = await models.saveProfile({
            name: data.name.trim(),
            title: (data.title || "").trim(),
            avatar: data.avatar || ""
          });
          // Push the saved values into the global header model immediately.
          var oApp = this.getOwnerComponent().getModel("app");
          oApp.setProperty("/profile", {
            name: saved.name || "",
            title: saved.title || "",
            avatar: saved.avatar || ""
          });
          MessageToast.show("Profile saved");
        } catch (e) {
          MessageToast.show(e.message || "Could not save profile");
        }
      }
    });
  }
);
