module.exports = function(R) {
    var _ = require("lodash");
    var assert = require("assert");
    var React = R.React;

    assert(R.isClient(), "R.Client: should only be loaded in the client.");
    window.React = React;

    var Client = function Client(App) {
        R.Debug.dev(function() {
            if(!window.React) {
                console.warn("Warning: React is not attached to window.");
            }
        });
        window.React = React;
        R.Debug.dev(R.scope(function() {
            if(!window.__ReactOnRails) {
                window.__ReactOnRails = {};
            }
            if(!window.__ReactOnRails.apps) {
                window.__ReactOnRails.apps = [];
            }
            window.__ReactOnRails.apps.push(this);
        }, this));
        this._app = new App();
    };

    _.extend(Client.prototype, /** @lends R.Client.prototype */ {
        _app: null,
        _rendered: false,
        mount: function* mount() {
            assert(!this._rendered, "R.Client.render(...): should only call mount() once.");
            yield this._app.renderIntoDocumentInClient(window);
        },
    });

    return Client;
};
