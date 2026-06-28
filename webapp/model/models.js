sap.ui.define(["sap/ui/model/json/JSONModel"], function (JSONModel) {
  "use strict";

  // Thin fetch wrapper around the REST API with JWT injection.
  function token() {
    try {
      return window.localStorage.getItem("favorites_token") || "";
    } catch (e) {
      return "";
    }
  }

  function setToken(t) {
    try {
      if (t) {
        window.localStorage.setItem("favorites_token", t);
      } else {
        window.localStorage.removeItem("favorites_token");
      }
    } catch (e) {
      /* ignore */
    }
  }

  async function request(method, path, body) {
    var opts = {
      method: method,
      headers: { "Content-Type": "application/json" }
    };
    var t = token();
    if (t) {
      opts.headers.Authorization = "Bearer " + t;
    }
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }
    var res = await fetch("/api" + path, opts);
    var data = null;
    var text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = text;
      }
    }
    if (!res.ok) {
      var msg = (data && data.error) || res.statusText || "Request failed";
      var err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    setToken: setToken,
    getToken: token,

    api: {
      get: function (p) {
        return request("GET", p);
      },
      post: function (p, b) {
        return request("POST", p, b);
      },
      put: function (p, b) {
        return request("PUT", p, b);
      },
      del: function (p) {
        return request("DELETE", p);
      }
    },

    // Convenience domain calls
    login: function (pin) {
      return request("POST", "/auth/login", { pin: pin });
    },
    listPages: function () {
      return request("GET", "/pages");
    },
    listTiles: function (pageId) {
      return request("GET", "/pages/" + pageId + "/tiles");
    },
    listAllTiles: function () {
      return request("GET", "/tiles");
    },
    preview: function (url) {
      return request("GET", "/preview?url=" + encodeURIComponent(url));
    },

    createJSONModel: function (data) {
      return new JSONModel(data);
    }
  };
});
