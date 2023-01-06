import React, { useState } from 'react';
import './App.css';

function App() {

  const [messengerInput, setMessengerInput] = useState('');
  const [reconnectCount, setReconnectCount] = useState(0);
  const [guid, setGuid] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [replies, setReplies] = useState();
  const [messages, setMessages] = useState([]);
  const [socket, setSocket] = useState(null);

  // * variables temporales*
  const [isTyping, setIsTyping] = useState(false)
  const [offline, setOffline] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  // **

  const config = {
    ws_url : (window.location.protocol === 'https:' ? 'wss' : 'ws') + '://' + window.location.host,
    reconnect_timeout: 3000,
    max_reconnect: 5,
    enable_history: false
  }

  const options = {
      use_sockets: true,
  }

  const on = (event, details) => {

  }
  
  const trigger = (event, detail) => {

  }

  const request = (url, body) => {
    return new Promise(function (resolve, reject) {
      var xmlhttp = new XMLHttpRequest();

      xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == XMLHttpRequest.DONE) {
          if (xmlhttp.status == 200) {
            var response = xmlhttp.responseText;
            if (response !='') {
              var message = null;
              try {
                message = JSON.parse(response);
              } catch (err) {
                reject(err);
                return;
              }
              resolve(message);
            } else {
                resolve([]);
            }
          } else {
            reject(new Error('status_' + xmlhttp.status));
          }
        }
      };

      xmlhttp.open("POST", url, true);
      xmlhttp.setRequestHeader("Content-Type", "application/json");
      xmlhttp.send(JSON.stringify(body));
    });
  }

  const send = (text, e) => {
    if(!text) return;

    var message = {
      type: 'outgoing',
      text: text
    };

    clearReplies();
    renderMessage(message);

    deliverMessage({
      type: 'message',
      text: text,
      user: guid,
      channel: options.use_sockets ? 'websocket' : 'webhook'
    });

    this.input.value = '';  // ??

    trigger('sent', message);

    return false;
  }

  const deliverMessage = (message) => {
    if (options.use_sockets) {
      socket.send(JSON.stringify(message));
    } else {
      webhook(message);
    }
  }

  const getHistory = (guid) => {
    if (guid) {
      request('/botkit/history', {
          user: guid
      }).then(function (history) {
          if (history.success) {
              trigger('history_loaded', history.history);
          } else {
              trigger('history_error', new Error(history.error));
          }
      }).catch(function (err) {
          trigger('history_error', err);
      });
    }
  }

   const webhook = (message) => {
    request('/api/messages', message).then(function (messages) {
        messages.forEach((message) => {
            trigger(message.type, message);
        });
    }).catch(function (err) {
        trigger('webhook_error', err);
    });
  }

  const connect = (user) => {
    if (user && user.id) {
      setCookie('botkit_guid', user.id, 1);

      user.timezone_offset = new Date().getTimezoneOffset();
      setCurrentUser(user);
      console.log('CONNECT WITH USER', user);
    }

    // connect to the chat server!
    if (options.use_sockets) {
      connectWebsocket(config.ws_url);
    } else {
      connectWebhook();
    }
  }

  const connectWebhook = () => {
    var connectEvent = 'hello';
    if (getCookie('botkit_guid')) {
        setGuid(getCookie('botkit_guid'));
        connectEvent = 'welcome_back';
    } else {
        setGuid(generate_guid());
        setCookie('botkit_guid', guid, 1);
    }

    if (options.enable_history) {
        getHistory();
    }

    // connect immediately
    trigger('connected', {});
    webhook({
        type: connectEvent,
        user: guid,
        channel: 'webhook',
    });
  }

  const connectWebsocket = (ws_url) => {
    // Create WebSocket connection.
    socket = new WebSocket(ws_url);

    var connectEvent = 'hello';
    if (getCookie('botkit_guid')) {
        setGuid(getCookie('botkit_guid'));
        connectEvent = 'welcome_back';
    } else {
        setGuid(generate_guid());
        setCookie('botkit_guid', guid, 1);
    }

    if (options.enable_history) {
        getHistory();
    }

    // Connection opened
    socket.addEventListener('open', function (event) {
      console.log('CONNECTED TO SOCKET');
      setReconnectCount(0);
      trigger('connected', event);
      deliverMessage({
        type: connectEvent,
        user: guid,
        channel: 'socket',
        user_profile: currentUser ? currentUser : null,
      });
    });

    socket.addEventListener('error', function (event) {
      console.error('ERROR', event);
    });

    socket.addEventListener('close', function (event) {
      console.log('SOCKET CLOSED!');
      trigger('disconnected', event);
      if (reconnectCount < config.max_reconnect) {
        setTimeout(function () {
          console.log('RECONNECTING ATTEMPT ', setReconnectCount(reconnectCount));
          connectWebsocket(config.ws_url);
        }, config.reconnect_timeout);
      } else {
        //message_window.className = 'offline';
      }
    });

    // Listen for messages
    socket.addEventListener('message', function (event) {
      var message = null;
      try {
          message = JSON.parse(event.data);
      } catch (err) {
          trigger('socket_error', err);
          return;
      }

      trigger(message.type, message);
    });
  }  

  const clearReplies = () => {
    setReplies([]);
  }

  const quickReply = (payload) => {
    send(payload);
  }

  const focus = () => {
    this.input.focus(); // ??
  }

  const renderMessage = (message) => {
    // ??
  }

  const triggerScript = (script, thread) => {
    deliverMessage({
        type: 'trigger',
        user: guid,
        channel: options.use_sockets ? 'websocket' : 'webhook',
        script: script,
        thread: thread
    })
  }

  const identifyUser = (user) => {
    user.timezone_offset = new Date().getTimezoneOffset();

    setGuid(user.id);
    setCookie('botkit_guid', user.id, 1);

    setCurrentUser(user)

    deliverMessage({
      type: 'identify',
      user: guid,
      channel: options.use_sockets ? 'websocket' : 'webhook',
      user_profile: user,
    });
  }

  const receiveCommand = (event) => {
    switch (event.data.name) {
      case 'trigger':
        // tell Botkit to trigger a specific script/thread
        console.log('TRIGGER', event.data.script, event.data.thread);
        triggerScript(event.data.script, event.data.thread);
        break;
      case 'identify':
        // link this account info to this user
        console.log('IDENTIFY', event.data.user);
        identifyUser(event.data.user);
          break;
      case 'connect':
        // link this account info to this user
        connect(event.data.user);
        break;
      default:
        console.log('UNKNOWN COMMAND', event.data);
    }
  }

  const sendEvent = (event) => { // ??
    if (this.parent_window) {
        this.parent_window.postMessage(event, '*');
    }
  }

  const setCookie = (cname, cvalue, exdays) => {
    var d = new Date();
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    var expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
  }

  const getCookie = (cname) => {
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) == ' ') {
          c = c.substring(1);
      }
      if (c.indexOf(name) == 0) {
          return c.substring(name.length, c.length);
      }
    }
    return "";
  }

  const s4 = () => {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }

  const generate_guid = () => {
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
  }

  const testSend = (e) => {
    e.preventDefault();
    console.log({texto: messengerInput, tipo: 'user'});

    let auxMessage = messages;
    auxMessage.push({texto: messengerInput, tipo: 'user'});
    setMessages(auxMessage);
    setMessengerInput('');

  }

  const handleInput = (e) => {
    setIsTyping(true);
    setMessengerInput(e.target.value);
    setTimeout(() => {
      setIsTyping(false);
    }, 2000);
  }


  return (
    <div className="wrapper">
      <br/>
      <div className='message_window'>
        <div>
         <div className='powered_by'> BotKit </div>

         {disconnected && (
          <div class="disconnected">
            Disconnected... reconnecting!
          </div>
         )}
         {offline && (
            <div class="offline">
              Offline! Reload to reconnect.
          </div>
         )}

         <section>
          <div id="message_list">
            <div id="message_template">
                <div class="message">
                  {isTyping && (
                      <div class="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  )}

                  <br /> 
                     
                {/*
                {{#if message.open_link}}
                  <a href="{{{message.open_link}}}" target="_blank" class="button_message">{{#if message.link_title}}{{message.link_title}}{{else}}{{message.open_link}}{{/if}}</a>
                {{/if}} */}

                </div>
                {/* {{#message.files}}
                  <div class="file_attachment">
                  {{#if image}}
                    <img src="{{{url}}}" alt="{{{url}}}" />
                  {{else}}
                    <a href="{{{url}}}" title="{{{url}}}">{{{url}}}</a>
                  {{/if}}
                  </div>
                {{/message.files}} */}
            </div>
          </div>
         </section>

      </div>

      <div className="container">
        <div className="CuadroMensajes">
          {messages.map((m, index) => (
            <div className="bubble" key={index}>
              <span className="text" >{m.texto}</span>
            </div>
          ))}
        </div>
      </div>

      <br />

      <div className='message_window'>
        <form onSubmit={testSend}>
          <input 
            type="text" 
            value={messengerInput}
            placeholder="Type here..."
            onChange={handleInput} />
          <button type="submit" style={{marginLeft:"4px"}}>Send</button>
        </form>
      </div>
      <footer>

      </footer>
      </div>
    </div>
  );
}

export default App;
