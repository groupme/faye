Faye.Transport.WebSocket = Faye.extend(Faye.Class(Faye.Transport, {
  UNCONNECTED:  <%= Faye::Transport::WebSocket::UNCONNECTED %>,
  CONNECTING:   <%= Faye::Transport::WebSocket::CONNECTING %>,
  CONNECTED:    <%= Faye::Transport::WebSocket::CONNECTED %>,

  batching:     false,

  isUsable: function(callback, context) {
    this.callback(function() { callback.call(context, true) });
    this.errback(function() { callback.call(context, false) });
    this.connect();
  },

  request: function(messages, timeout) {
    if (messages.length === 0) return;
    this._messages = this._messages || {};

    for (var i = 0, n = messages.length; i < n; i++) {
      this._messages[messages[i].id] = messages[i];
    }
    this.callback(function(socket) { socket.send(Faye.toJSON(messages)) });
    this.connect();
  },

  close: function() {
    if (!this._socket) return;
    this._socket.onclose = this._socket.onerror = null;
    this._socket.close();
    delete this._socket;
    this.setDeferredStatus('deferred');
    this._state = this.UNCONNECTED;
  },

  connect: function() {
    if (Faye.Transport.WebSocket._unloaded) return;

    this._state = this._state || this.UNCONNECTED;
    if (this._state !== this.UNCONNECTED) return;

    this._state = this.CONNECTING;

    var ws = Faye.Transport.WebSocket.getClass();
    if (!ws) return this.setDeferredStatus('failed');

    this._socket = new ws(Faye.Transport.WebSocket.getSocketUrl(this.endpoint));
    var self = this;

    this._socket.onopen = function() {
      self._state = self.CONNECTED;
      self._everConnected = true;
      self.setDeferredStatus('succeeded', self._socket);
      self.trigger('up');
    };

    this._socket.onmessage = function(event) {
      var messages = JSON.parse(event.data);
      if (!messages) return;
      messages = [].concat(messages);

      for (var i = 0, n = messages.length; i < n; i++) {
        delete self._messages[messages[i].id];
      }
      self.receive(messages);
    };

    this._socket.onclose = this._socket.onerror = function() {
      var wasConnected = (self._state === self.CONNECTED);
      self.setDeferredStatus('deferred');
      self._state = self.UNCONNECTED;

      self.close();

      if (wasConnected) return self.resend();
      if (!self._everConnected) return self.setDeferredStatus('failed');

      var retry = self._client.retry * 1000;
      Faye.ENV.setTimeout(function() { self.connect() }, retry);
      self.trigger('down');
    };
  },

  resend: function() {
    if (!this._messages) return;
    var messages = Faye.map(this._messages, function(id, msg) { return msg });
    this.request(messages);
  }
}), {
  getSocketUrl: function(endpoint) {
    if (Faye.URI) endpoint = Faye.URI.parse(endpoint).toURL();
    return endpoint.replace(/^http(s?):/ig, 'ws$1:');
  },

  getClass: function() {
    return (Faye.WebSocket && Faye.WebSocket.Client) ||
            Faye.ENV.WebSocket ||
            Faye.ENV.MozWebSocket;
  },

  isUsable: function(client, endpoint, callback, context) {
    this.create(client, endpoint).isUsable(callback, context);
  },

  create: function(client, endpoint) {
    var sockets = client.transports.websocket = client.transports.websocket || {};
    sockets[endpoint] = sockets[endpoint] || new this(client, endpoint);
    return sockets[endpoint];
  }
});

Faye.extend(Faye.Transport.WebSocket.prototype, Faye.Deferrable);
Faye.Transport.register('websocket', Faye.Transport.WebSocket);

if (Faye.Event)
  Faye.Event.on(Faye.ENV, 'beforeunload', function() {
    Faye.Transport.WebSocket._unloaded = true;
  });

