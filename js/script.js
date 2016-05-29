(function () {
  var Chat = function () {
    this.worker = new Worker('worker.js');
    this.peer = {};
    this.connection = {};
    this.connectedPeers = {};
    this.pass = '';
    this.userPrivateRSAKey = ''
    this.userPublicRSAKey = '';
    this.companionPublicRSAKey = '';
    this.messagesBox = $('#messagesBox');
    this.isTyping = '';
    this.isMenuHidden = true;
    this.playMessageSound = '';
    this.isConnected = false;
    this.isStarter = false;

    this.init();
  };

  Chat.prototype.init = function () {
    var __self = this;

    this.peer = new Peer({
      key: 'dkp6zru1riugcik9',
      debug: 3,
      logFunction: function() {
        var copy = Array.prototype.slice.call(arguments).join(' ');
        console.log(copy);
      }
    });

    this.isTyping = false;
    this.playMessageSound = document.createElement('audio');
    this.playMessageSound.setAttribute('src', 'sound/newmsg.wav');


    this.peer.on('open', function () {
      $('#pid').html(__self.peer.id);
    });
    this.peer.on('connection', this.connect.bind(this));
    this.peer.on('error', function (err) {
      console.log('Error: ' + err);
    });



    $('#menuButton').click(this.onMenuClick.bind(this)); //mobile menu

    $('#generateKey').click(function () {
      __self.generateRSAKeys.call(__self);

      $('#pid').prop('hidden', false);
      $('#chatBoxKeys').fadeOut(400, function () {
        $('#chatBoxMenuConnection').fadeIn(400);
      });
    });

    $('#connectionID').on('input', this.renderConnection.bind(this));
    $('#buttonConnect').click(function () {
      __self.onConnectClick();
      __self.isStarter = true;
      $('#connectionStatus').html('Подключение...');
      $('#connectionStatus').removeClass('menu-status--not-connected menu-status--connected').addClass('menu-status--awaiting');
    });

    $('#sendMessageButton').click(this.sendMessage.bind(this));
    $('#messageText').keypress(function (e) {
      if(e.which == 13) {
        $('#sendMessageButton').trigger('click');
      }
    });
    $('#messageText').on('input', this.sendTypingState.bind(this));
  };

  Chat.prototype.generatePassword = function () {
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*();.",
        result = '';
    for(var i = 0; i < 256; i++) {
      result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }

    return result;
  };

  Chat.prototype.generateRSAKeys = function () { //TODO: may try to add Web Worker
    this.pass = this.generatePassword();
    this.userPrivateRSAKey = cryptico.generateRSAKey(this.pass, 512);
    this.userPublicRSAKey = cryptico.publicKeyString(this.userPrivateRSAKey);
  };

  Chat.prototype.connect = function (c) {

    var __self = this;

    if (c.label == 'chat') {
      //Handle received messages

      //This function send user public RSA key as first message when connection is established
      if(this.companionPublicRSAKey == '') {
        var checker = setInterval(function () {
          if(Object.keys(__self.connection).length != 0 && __self.isConnected && Object.keys(__self.connectedPeers).length != 0) { //we check if connection is established. idk why that timeout, but it doesn't send messages without pause after connection
            setTimeout(function () {
              __self.connection.send(__self.userPublicRSAKey);
            }, 1500);
            window.clearInterval(checker);
          }
        }, 500);
      }
      c.on('data', function (data) {

        if(__self.companionPublicRSAKey == '') { //when companion public key is not set, first message will set it
          __self.companionPublicRSAKey = data;
        }
        else {
          var tData = JSON.parse(data),
              msg = '';

          msg = cryptico.decrypt(tData.cipher, __self.userPrivateRSAKey).plaintext;
          msg = Base64.decode(msg);


          if(msg == '{{<currentUserIsTyping>}}') {
            $('#typingState').fadeIn('slow');
          }
          else if(msg == '{{<currentUserHasStoppedTyping>}}') {
            $('#typingState').fadeOut('slow');
          }
          else if(msg == '{{<ID_HAS_BEEN_CONFIRMED>}}') {
            $('#connectionStatus').html('Подключен');
          }
          else {
            __self.playMessageSound.play();
            __self.renderNewMessage(msg, "guest-message");
          }
          console.log('Received: ' + data);
        }
      });

      //If companion left
      c.on('close', function () {
        console.log('Companion has left');
        __self.connection = {};
        __self.isConnected = false;
        delete __self.connectedPeers[c.peer];
        $('#messageText').prop('disabled', true);
        $('#sendMessageButton').prop('disabled', true);
        $('#connectionStatus').html('Собеседник вышел').removeClass('menu-status--connected menu-status--awaiting').addClass('menu-status--not-connected');
      });
    }
    if(Object.keys(this.connection).length == 0) { //if there is no active connections yet
      console.log('First connection time');

      this.connectedPeers[c.peer] = 1;
      this.connection = c;
      this.isConnected = true;

      __self.renderMainWindow(); //TODO: use another function, this one won't work
    }
  };

  Chat.prototype.onConnectClick = function () {
    var __self = this;
    var RequestedPeer = $('#connectionID').val().replace(/</g, "&lt;").replace(/>/g, "&gt;");

    if(!this.connectedPeers[RequestedPeer]) {
      var c = this.peer.connect(RequestedPeer, {
        label: 'chat',
        serialization: 'none',
        metadata: {message: 'hi i want to chat with you!'}
      });

      c.on('open', function () {
        __self.isConnected = true;
        __self.connect(c);
      });
      c.on('error', function (err) {
        console.log(err);
      });
    }
    this.connectedPeers[RequestedPeer] = 1;
  };

  Chat.prototype.sendMessage = function (e) {
    e.preventDefault();

    var msg = $('#messageText').val().replace(/</g, "&lt;").replace(/>/g, "&gt;");

    this.renderNewMessage(msg, "my-message");

    if(this.companionPublicRSAKey != '') { //because first message shouldn't be encrypted
      msg = Base64.encode(msg);
      msg = cryptico.encrypt(msg, this.companionPublicRSAKey);
    }

    this.connection.send(JSON.stringify(msg));
    this.sendTypingState();
    console.log('Send: ' + JSON.stringify(msg));
  };

  Chat.prototype.sendTypingState = function () {
    if($('#messageText').val().length > 0 && this.isTyping == false) {
      var msg = '{{<currentUserIsTyping>}}';
      msg = Base64.encode(msg);
      msg = cryptico.encrypt(msg, this.companionPublicRSAKey);
      this.connection.send(JSON.stringify(msg));

      this.isTyping = true;
    }
    else if($('#messageText').val().length == 0){
      var msg = '{{<currentUserHasStoppedTyping>}}';
      msg = Base64.encode(msg);
      msg = cryptico.encrypt(msg, this.companionPublicRSAKey);
      this.connection.send(JSON.stringify(msg));

      this.isTyping = false;
    }
  };

  Chat.prototype.onMenuClick = function () {
    var toLeft = this.isMenuHidden ? '0' : '100%';
    console.log(toLeft);
    $('#chatboxMenu').animate({
      left: toLeft
    }, 500);

    this.isMenuHidden = !this.isMenuHidden;
  };


  Chat.prototype.renderConnection = function () {
    if($('#connectionID').val().length > 0) {
      $('#buttonConnect').prop('disabled', false);
    }
    else {
      $('#buttonConnect').prop('disabled', true);
    }
  };

  Chat.prototype.renderMainWindow = function () {
    var __self = this;

    var isReady = setInterval(function () { //we check if key are set
      if(__self.companionPublicRSAKey != '') {
        $('#chatBoxMenuConnection').fadeOut(400);
        $('#messageText').prop('disabled', false);
        $('#sendMessageButton').prop('disabled', false);
        $('#connectionStatus').html('Подключен (собеседник не подтвержден)');
        $('#connectionStatus').removeClass('menu-status--not-connected menu-status--awaiting').addClass('menu-status--connected');

        if(!__self.isStarter) {
          var confirmID = prompt('Введите ID собеседника');
          if(confirmID === __self.connection.peer) {
            var msg = "{{<ID_HAS_BEEN_CONFIRMED>}}";

            if(__self.companionPublicRSAKey != '') { //because first message shouldn't be encrypted
              msg = Base64.encode(msg);
              msg = cryptico.encrypt(msg, __self.companionPublicRSAKey);
            }

            __self.connection.send(JSON.stringify(msg));
            $('#connectionStatus').html('Подключен');
          }
        }

        window.clearInterval(isReady);
      }
    }, 500);

  };

  Chat.prototype.renderNewMessage = function (msg, type) {
    var boxHeight = document.querySelector('#messagesBox').scrollHeight;

    var wrapper = document.createElement('div'),
        messageElem = document.createElement('div');
    wrapper.classList.add('chat-box__message-wrapper');
    messageElem.classList.add('chat-box__message', type);

    messageElem.innerHTML = msg;

    wrapper.appendChild(messageElem);

    this.messagesBox.append(wrapper);

    if(type == 'my-message') {
      $('#messageText').val(''); 
    }
    
    this.messagesBox.scrollTop(boxHeight);
  };

  window.peerjschat = new Chat();

})();