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

    return Controller.extend("sap.favorites.controller.AdminPages", {
      onInit: function () {
        this._model = new JSONModel({ pages: [] });
        this.getView().setModel(this._model);
        this._dialogModel = new JSONModel({});
        this._load();
      },

      _load: async function () {
        try {
          var pages = await models.listPages();
          this._model.setProperty("/pages", pages);
        } catch (e) {
          MessageToast.show("Load failed: " + e.message);
        }
      },

      _openDialog: function () {
        var that = this;
        if (this._dialog) {
          this._dialog.setModel(this._dialogModel, "dlg");
          this._dialog.open();
          return Promise.resolve();
        }
        return Fragment.load({
          id: "pageFrag",
          name: "sap.favorites.fragment.PageDialog",
          controller: this
        }).then(function (oDialog) {
          that._dialog = oDialog;
          that.getView().addDependent(oDialog);
          oDialog.setModel(that._dialogModel, "dlg");
          oDialog.open();
        }).catch(function (err) {
          MessageToast.show("Could not open dialog: " + (err && err.message));
        });
      },

      onAdd: function () {
        this._dialogModel.setData({ id: null, name: "", icon: "sap-icon://folder" });
        this._openDialog();
      },

      onEdit: function (oEvent) {
        var ctx = oEvent.getSource().getBindingContext();
        this._dialogModel.setData(Object.assign({}, ctx.getObject()));
        this._openDialog();
      },

      onSaveDialog: async function () {
        var data = this._dialogModel.getData();
        if (!data.name) {
          MessageToast.show("Name is required");
          return;
        }
        try {
          if (data.id) {
            await models.api.put("/pages/" + data.id, { name: data.name, icon: data.icon });
          } else {
            await models.api.post("/pages", { name: data.name, icon: data.icon });
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

      onDelete: function (oEvent) {
        var ctx = oEvent.getSource().getBindingContext();
        var page = ctx.getObject();
        var that = this;
        MessageBox.confirm(
          'Delete page "' + page.name + '" and all its tiles?',
          {
            onClose: async function (action) {
              if (action !== MessageBox.Action.OK) {
                return;
              }
              try {
                await models.api.del("/pages/" + page.id);
                MessageToast.show("Deleted");
                that._load();
              } catch (e) {
                MessageToast.show("Delete failed: " + e.message);
              }
            }
          }
        );
      },

      onMoveUp: function (oEvent) {
        this._move(oEvent, -1);
      },

      onMoveDown: function (oEvent) {
        this._move(oEvent, 1);
      },

      _move: async function (oEvent, dir) {
        var pages = this._model.getProperty("/pages").slice();
        var ctx = oEvent.getSource().getBindingContext();
        var idx = pages.indexOf(ctx.getObject());
        var swap = idx + dir;
        if (swap < 0 || swap >= pages.length) {
          return;
        }
        var tmp = pages[idx];
        pages[idx] = pages[swap];
        pages[swap] = tmp;
        this._model.setProperty("/pages", pages);
        try {
          await models.api.post("/pages/reorder", {
            order: pages.map(function (p) {
              return p.id;
            })
          });
        } catch (e) {
          MessageToast.show("Reorder failed: " + e.message);
          this._load();
        }
      }
    });
  }
);
