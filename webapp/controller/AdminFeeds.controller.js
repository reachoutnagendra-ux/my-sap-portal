sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/favorites/model/models",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
  ],
  function (Controller, Fragment, JSONModel, models, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("sap.favorites.controller.AdminFeeds", {
      onInit: function () {
        this._model = new JSONModel({ feeds: [], pages: [] });
        this.getView().setModel(this._model);
        this._dialogModel = new JSONModel({});
        this.getOwnerComponent().getEventBus().subscribe("admin", "loggedIn", this._load, this);
        this._load();
      },

      onExit: function () {
        this.getOwnerComponent().getEventBus().unsubscribe("admin", "loggedIn", this._load, this);
      },

      _load: async function () {
        try {
          var pages = await models.listPages();
          this._model.setProperty("/pages", pages);
          var feeds = await models.api.get("/feeds");
          this._model.setProperty("/feeds", feeds);
        } catch (e) {
          if (e.status !== 401) {
            MessageToast.show("Load failed: " + e.message);
          }
        }
      },

      _openDialog: function () {
        var that = this;
        if (this._dialog) {
          this._dialog.setModel(this._dialogModel, "dlg");
          this._dialog.setModel(this._model, "ctx");
          this._dialog.open();
          return;
        }
        Fragment.load({
          id: "feedFrag",
          name: "sap.favorites.fragment.FeedDialog",
          controller: this
        }).then(function (oDialog) {
          that._dialog = oDialog;
          that.getView().addDependent(oDialog);
          oDialog.setModel(that._dialogModel, "dlg");
          oDialog.setModel(that._model, "ctx");
          oDialog.open();
        }).catch(function (err) {
          MessageToast.show("Could not open dialog: " + (err && err.message));
        });
      },

      onAdd: function () {
        this._dialogModel.setData({
          id: null,
          name: "",
          type: "rss",
          identifier: "",
          target_page: this._model.getProperty("/pages/0/id") || null,
          frequency: "weekly",
          enabled: true
        });
        this._openDialog();
      },

      onEdit: function (oEvent) {
        var ctx = oEvent.getSource().getBindingContext();
        this._dialogModel.setData(Object.assign({}, ctx.getObject()));
        this._openDialog();
      },

      onSaveDialog: async function () {
        var d = this._dialogModel.getData();
        if (!d.name || !d.identifier) {
          MessageToast.show("Name and identifier are required");
          return;
        }
        try {
          if (d.id) {
            await models.api.put("/feeds/" + d.id, d);
          } else {
            await models.api.post("/feeds", d);
          }
          this._dialog.close();
          MessageToast.show("Saved");
          this._load();
        } catch (e) {
          MessageToast.show("Save failed: " + e.message);
        }
      },

      onCancelDialog: function () {
        this._dialog.close();
      },

      onToggleEnabled: async function (oEvent) {
        var ctx = oEvent.getSource().getBindingContext();
        var feed = ctx.getObject();
        try {
          await models.api.put("/feeds/" + feed.id, { enabled: oEvent.getParameter("state") });
        } catch (e) {
          MessageToast.show("Update failed: " + e.message);
          this._load();
        }
      },

      onScrape: async function (oEvent) {
        var ctx = oEvent.getSource().getBindingContext();
        var feed = ctx.getObject();
        oEvent.getSource().setBusy(true);
        try {
          var res = await models.api.post("/feeds/" + feed.id + "/scrape", {});
          MessageToast.show("Scraped: " + res.suggestions + " new suggestion(s)");
        } catch (e) {
          MessageToast.show("Scrape failed: " + e.message);
        } finally {
          oEvent.getSource().setBusy(false);
        }
      },

      onDelete: function (oEvent) {
        var ctx = oEvent.getSource().getBindingContext();
        var feed = ctx.getObject();
        var that = this;
        MessageBox.confirm('Delete feed source "' + feed.name + '"?', {
          onClose: async function (action) {
            if (action !== MessageBox.Action.OK) {
              return;
            }
            try {
              await models.api.del("/feeds/" + feed.id);
              MessageToast.show("Deleted");
              that._load();
            } catch (e) {
              MessageToast.show("Delete failed: " + e.message);
            }
          }
        });
      }
    });
  }
);
