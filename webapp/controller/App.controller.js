sap.ui.define(["sap/ui/core/mvc/Controller"], function (Controller) {
  "use strict";

  return Controller.extend("sap.favorites.controller.App", {
    onInit: function () {
      var oView = this.getView();
      oView.addStyleClass(
        this.getOwnerComponent().getContentDensityClass()
      );
    }
  });
});
