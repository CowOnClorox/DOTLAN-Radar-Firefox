
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.contentScriptQuery == "postAuthCode"){
      fetch('https://login.eveonline.com/v2/oauth/token', {
        method: 'post',
        headers: {
          Authorization: atob("QmFzaWMgTVRRNE1qY3lNRFprWkRCbE5HTTFaRGd3TmpCa016Vmxaall6WWpsbFpXTTZhekU0YmtKNU5uVmhhMHB5UjB0dlIxaENVRkoxY2paak4yNUlUMUp4TkdFelpVNTRZalZ0T0E9PQ=="),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: 'grant_type=authorization_code&code='+request.code
      })
      .then( (r) => r.json() )
      .then( (response) => {
        sendResponse(response);
      })
      .catch( (error) => {
        console.log(error);
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
        body: 'grant_type=refresh_token&refresh_token='+request.tokenArg
      })
      .then( (r) => r.json() )
      .then( (response) => {
        sendResponse(response);
      })
      .catch( (error) => {
        console.log(error);
        sendResponse(false);
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
