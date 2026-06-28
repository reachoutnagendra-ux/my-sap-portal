sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/favorites/model/models",
    "sap/m/MessageToast"
  ],
  function (Controller, Fragment, models, MessageToast) {
    "use strict";

    return Controller.extend("sap.favorites.controller.Admin", {
      onInit: function () {
        var oRouter = this.getOwnerComponent().getRouter();
        oRouter.getRoute("admin").attachPatternMatched(this._onEnter, this);
      },

      _onEnter: function () {
        var oApp = this.getOwnerComponent().getModel("app");
        if (!oApp.getProperty("/isAdmin") || !models.getToken()) {
          this._promptLogin();
        } else {
          this._loadMeta();
        }
      },

      _loadMeta: async function () {
        var oApp = this.getOwnerComponent().getModel("app");
        try {
          var suggestions = await models.api.get("/suggestions?status=pending");
          oApp.setProperty(
            "/pendingCount",
            suggestions.length ? String(suggestions.length) : ""
          );
        } catch (e) {
          /* token may be expired */
          if (e.status === 401) {
            this._promptLogin();
          }
        }
      },

      _promptLogin: function () {
        var that = this;
        if (this._loginDialog) {
          this._loginDialog.open();
          return;
        }
        Fragment.load({
          id: "loginFrag",
          name: "sap.favorites.fragment.LoginDialog",
          controller: this
        }).then(function (oDialog) {
          that._loginDialog = oDialog;
          that.getView().addDependent(oDialog);
          oDialog.open();
        });
      },

      onSubmitLogin: async function () {
        var sPin = Fragment.byId("loginFrag", "pinInput").getValue();
        try {
          var res = await models.login(sPin);
          models.setToken(res.token);
          var oApp = this.getOwnerComponent().getModel("app");
          oApp.setProperty("/token", res.token);
          oApp.setProperty("/isAdmin", true);
          this._loginDialog.close();
          MessageToast.show("Welcome, admin");
          this._loadMeta();
          // Tell the eager sub-tabs (which loaded before auth) to reload.
          this.getOwnerComponent().getEventBus().publish("admin", "loggedIn");
        } catch (e) {
          MessageToast.show(e.message || "Login failed");
        }
      },

      onCancelLogin: function () {
        this._loginDialog.close();
        this.onBack();
      },

      onLogout: function () {
        models.setToken("");
        var oApp = this.getOwnerComponent().getModel("app");
        oApp.setProperty("/token", "");
        oApp.setProperty("/isAdmin", false);
        MessageToast.show("Logged out");
        this.onBack();
      },

      onBack: function () {
        this.getOwnerComponent().getRouter().navTo("home");
      }
    });
  }
);
