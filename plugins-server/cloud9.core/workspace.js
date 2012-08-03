var util  = require("./util");

var Workspace = module.exports = function(ide) {
    this.ide = ide;
    this.workspaceId  = ide.options.workspaceId;
    this.workspaceDir = ide.options.workspaceDir;
};

(function() {

    this.createPlugins = function (plugins) {
        this.plugins = {};

        for (var name in plugins) {
            this.plugins[name] = new plugins[name](this.ide, this);
        }

        for (var name in plugins) {
            if (this.plugins[name].init)
                this.plugins[name].init();
        }
    };

    this.getServerExclude = function(user) {
        return util.arrayToMap(user.getPermissions().server_exclude.split("|"));
    };

    this.execHook = function(hook, user /* varargs */) {
        var self = this;
        var args = Array.prototype.slice.call(arguments, 1);
        var hook = hook.toLowerCase().trim();

        var server_exclude = this.getServerExclude(user);

        for (var name in this.plugins) {
            if (server_exclude[name]) continue;

            var plugin = this.plugins[name];
            var hooks = plugin.getHooks();
            if (hooks.indexOf(hook) > -1 && plugin[hook].apply(plugin, args) === true) {
                return;
            }
        }

        // If a message is sent with the requireshandling flag then the client
        // wants to be notified via an error that there was no plugin found to
        // handle this command
        var message = args.length > 1 && args[1];
        if (message && message.requireshandling === true) {
            function sendCommandNotFound(err) {
                self.send({
                    type: "result",
                    subtype: "info",
                    body: err || "Command '" + message.command + "' was not recognized",
                    extra: message.extra
                }, message);
            }
            
            if (this.plugins["npm-runtime"]) {
                this.plugins["npm-runtime"].searchAndRunModuleHook(message, user, function(err, found) {
                    if (err || !found)
                        sendCommandNotFound(err);
                });
            }
            else
                sendCommandNotFound();
        }
    };

    this.getExt = function(name) {
        return this.plugins[name] || null;
    };

    this.send = function(msg, replyTo, scope) {
        if (replyTo)
            msg.sid = replyTo.sid;
        this.ide.broadcast(JSON.stringify(msg), scope);
    };

    this.sendError = function(error, client) {
        if (client)
            client.send(JSON.stringify(error));
        else
            this.ide.broadcast(error);
    };

    this.error = function(description, code, message, client) {
        var sid = (message || {}).sid || -1;
        var error = {
            "type": "error",
            "sid": sid,
            "code": code,
            "message": (typeof description === "object" && description.message) ? description.message : description
        };

        if (typeof description === "object" && description.stack) {
            console.error(description.stack);
        }

        this.sendError(error, client || null);
    };

    this.canShutdown = function() {
        var self = this;
        return Object.keys(this.plugins).every(function(name) {
            return self.plugins[name].canShutdown();
        });
    };

    this.dispose = function(callback) {
        var count = 0;
        for (var name in this.plugins) {
            count += 1;
            this.plugins[name].dispose(function() {
                process.nextTick(function() {
                    count -= 1;
                    if (count === 0)
                        callback && callback();
                });
            });
        }
    };

}).call(Workspace.prototype);
