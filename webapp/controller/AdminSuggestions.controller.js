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

    return Controller.extend("sap.favorites.controller.AdminSuggestions", {
      formatter: formatter,

      onInit: function () {
        this._model = new JSONModel({ suggestions: [] });
        this.getView().setModel(this._model);
        this.getOwnerComponent().getEventBus().subscribe("admin", "loggedIn", this._load, this);
        this._load();
      },

      onExit: function () {
        this.getOwnerComponent().getEventBus().unsubscribe("admin", "loggedIn", this._load, this);
      },

      _load: async function () {
        try {
          var list = await models.api.get("/suggestions?status=pending");
          this._model.setProperty("/suggestions", list);
          this._updateBadge(list.length);
        } catch (e) {
          if (e.status !== 401) {
            MessageToast.show("Load failed: " + e.message);
          }
        }
      },

      _updateBadge: function (n) {
        var oApp = this.getOwnerComponent().getModel("app");
        oApp.setProperty("/pendingCount", n ? String(n) : "");
      },

      onRefresh: function () {
        this._load();
      },

      onApprove: async function (oEvent) {
        var s = oEvent.getSource().getBindingContext().getObject();
        try {
          await models.api.put("/suggestions/" + s.id + "/approve", {});
          MessageToast.show("Approved → added to board");
          this._load();
        } catch (e) {
          MessageToast.show("Approve failed: " + e.message);
        }
      },

      onReject: async function (oEvent) {
        var s = oEvent.getSource().getBindingContext().getObject();
        try {
          await models.api.put("/suggestions/" + s.id + "/reject", {});
          MessageToast.show("Rejected");
          this._load();
        } catch (e) {
          MessageToast.show("Reject failed: " + e.message);
        }
      },

      onOpen: function (oEvent) {
        var s = oEvent.getSource().getBindingContext().getObject();
        if (s.url) {
          window.open(s.url, "_blank", "noopener");
        }
      }
    });
  }
);
