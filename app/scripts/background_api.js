
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.contentScriptQuery == "postAuthCode"){
      fetch('https://login.eveonline.com/v2/oauth/token', {
        method: 'post',
        headers: {
          Authorization: atob("QmFzaWMgTVRRNE1qY3lNRFprWkRCbE5HTTFaRGd3TmpCa016Vmxaall6WWpsbFpXTTZhekU0YmtKNU5uVmhhMHB5UjB0dlIxaENVRkoxY2paak4yNUlUMUp4TkdFelpVNTRZalZ0T0E9PQ=="),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams([
          ['grant_type', 'authorization_code'],
          ['code', request.code]
        ])
      })
      .then( (response) => {
        return response.json()
        .then( (payload) => {
          if (response.status < 200 || response.status >= 300) {
            if (response.status == 400 && payload && payload.error == "invalid_grant") {
              return {error: "invalid_grant"};
            }
            return {error: "transient"};
          }
          if (payload && typeof payload.error == "string") {
            return {error: "transient"};
          }
          if (!payload ||
              typeof payload.access_token != "string" ||
              payload.access_token.length == 0 ||
              typeof payload.refresh_token != "string" ||
              payload.refresh_token.length == 0) {
            return {error: "transient"};
          }
          return payload;
        })
        .catch( () => ({error: "transient"}));
      })
      .catch( () => ({error: "transient"}))
      .then( (result) => {
        sendResponse(result);
      })
      return true;
    }
    else if (request.contentScriptQuery == "refreshToken"){
      fetch('https://login.eveonline.com/v2/oauth/token', {
        method: 'post',
        headers: {
          Authorization: atob("QmFzaWMgTVRRNE1qY3lNRFprWkRCbE5HTTFaRGd3TmpCa016Vmxaall6WWpsbFpXTTZhekU0YmtKNU5uVmhhMHB5UjB0dlIxaENVRkoxY2paak4yNUlUMUp4TkdFelpVNTRZalZ0T0E9PQ=="),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams([
          ['grant_type', 'refresh_token'],
          ['refresh_token', request.tokenArg]
        ])
      })
      .then( (response) => {
        return response.json()
        .then( (payload) => {
          if (response.status < 200 || response.status >= 300) {
            if (response.status == 400 && payload && payload.error == "invalid_grant") {
              return {error: "invalid_grant"};
            }
            return {error: "transient"};
          }
          if (payload && typeof payload.error == "string") {
            return {error: "transient"};
          }
          if (!payload ||
              typeof payload.access_token != "string" ||
              payload.access_token.length == 0 ||
              (Object.prototype.hasOwnProperty.call(payload, 'refresh_token') &&
                (typeof payload.refresh_token != "string" || payload.refresh_token.length == 0))) {
            return {error: "transient"};
          }
          return payload;
        })
        .catch( () => ({error: "transient"}));
      })
      .catch( () => ({error: "transient"}))
      .then( (result) => {
        sendResponse(result);
      })
      return true;
    }
    else if (request.contentScriptQuery == "revokeToken") {
      var responseSent = false;
      var sendRevokeResponse = function(result) {
        if (!responseSent) {
          responseSent = true;
          sendResponse(result);
        }
      };
      var revoke = function(tokenToRevoke, tokenTypeHint) {
        return fetch('https://login.eveonline.com/v2/oauth/revoke', {
          method: 'post',
          headers: {
            Authorization: atob("QmFzaWMgTVRRNE1qY3lNRFprWkRCbE5HTTFaRGd3TmpCa016Vmxaall6WWpsbFpXTTZhekU0YmtKNU5uVmhhMHB5UjB0dlIxaENVRkoxY2paak4yNUlUMUp4TkdFelpVNTRZalZ0T0E9PQ=="),
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams([
            ['token_type_hint', tokenTypeHint],
            ['token', tokenToRevoke]
          ])
        })
        .then( (response) => {
          return response.status >= 200 && response.status < 300;
        })
        .catch( () => false);
      };

      Promise.all([
        revoke(request.token, 'access_token'),
        revoke(request.refreshToken, 'refresh_token')
      ])
      .then( (results) => {
        sendRevokeResponse(results[0] && results[1]);
      })
      .catch( () => {
        sendRevokeResponse(false);
      });
      return true;
    }
  });
