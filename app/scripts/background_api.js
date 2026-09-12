var ESI_CLIENT_ID = 'f7b4d46e9ec2494481e8a40fd860540a';
var ESI_REDIRECT_URI = 'https://fd9b2657a6e126c6265245caa1535e6e348a22c2.extensions.allizom.org/';
var ESI_AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
var ESI_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
var ESI_REVOKE_URL = 'https://login.eveonline.com/v2/oauth/revoke';
var ESI_SCOPE = 'esi-location.read_location.v1 esi-ui.write_waypoint.v1';
var activeAuthAttempt = null;

function RespondOnce(sendResponse) {
  var responseSent = false;
  return function(result) {
    if (!responseSent) {
      responseSent = true;
      sendResponse(result);
    }
  };
}

function Base64UrlEncode(bytes) {
  var binary = '';
  for (var i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function RandomBase64Url() {
  var bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Base64UrlEncode(bytes);
}

function CreatePKCEParameters() {
  var state = RandomBase64Url();
  var verifier = RandomBase64Url();
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    .then(function(digest) {
      return {
        state: state,
        verifier: verifier,
        challenge: Base64UrlEncode(new Uint8Array(digest))
      };
    });
}

function ClassifyTokenResponse(response, payload, refreshTokenOptional) {
  if (!response || response.status < 200 || response.status >= 300) {
    if (response && response.status == 400 && payload && payload.error == 'invalid_grant') {
      return {error: 'invalid_grant'};
    }
    return {error: 'transient'};
  }
  if (!payload || typeof payload != 'object' || Array.isArray(payload) ||
      typeof payload.error == 'string' ||
      typeof payload.access_token != 'string' ||
      payload.access_token.length == 0 ||
      (!refreshTokenOptional &&
        (typeof payload.refresh_token != 'string' || payload.refresh_token.length == 0)) ||
      (refreshTokenOptional && Object.prototype.hasOwnProperty.call(payload, 'refresh_token') &&
        (typeof payload.refresh_token != 'string' || payload.refresh_token.length == 0))) {
    return {error: 'transient'};
  }
  return payload;
}

function RequestToken(body, refreshTokenOptional) {
  return Promise.resolve()
    .then(function() {
      return fetch(ESI_TOKEN_URL, {
        method: 'post',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body
      });
    })
    .then(function(response) {
      return response.json()
        .then(function(payload) {
          return ClassifyTokenResponse(response, payload, refreshTokenOptional);
        })
        .catch(function() {
          return {error: 'transient'};
        });
    })
    .catch(function() {
      return {error: 'transient'};
    });
}

function ValidateAuthRedirect(responseUrl, redirectUri, state) {
  var callbackUrl;
  var registeredUrl;
  try {
    callbackUrl = new URL(responseUrl);
    registeredUrl = new URL(redirectUri);
  }
  catch (error) {
    return null;
  }
  if (callbackUrl.origin != registeredUrl.origin ||
      callbackUrl.pathname != registeredUrl.pathname ||
      callbackUrl.hash != '') {
    return null;
  }

  var seenParameters = Object.create(null);
  var duplicateParameter = false;
  callbackUrl.searchParams.forEach(function(value, key) {
    if (seenParameters[key]) {
      duplicateParameter = true;
    }
    seenParameters[key] = true;
  });
  if (duplicateParameter || callbackUrl.searchParams.has('error') ||
      callbackUrl.searchParams.has('error_description') ||
      callbackUrl.searchParams.has('error_uri')) {
    return null;
  }

  var codes = callbackUrl.searchParams.getAll('code');
  var states = callbackUrl.searchParams.getAll('state');
  if (codes.length != 1 || codes[0].length == 0 ||
      states.length != 1 || states[0] != state) {
    return null;
  }
  return codes[0];
}

function LaunchAuthFlow(attempt, authUrl) {
  return new Promise(function(resolve, reject) {
    chrome.identity.launchWebAuthFlow({url: authUrl, interactive: true}, function(responseUrl) {
      var lastError = chrome.runtime.lastError;
      if (lastError) {
        reject({error: 'cancelled'});
        return;
      }
      if (activeAuthAttempt !== attempt) {
        reject({error: 'stale'});
        return;
      }
      var code = ValidateAuthRedirect(responseUrl, attempt.redirectUri, attempt.state);
      if (code == null) {
        reject({error: 'transient'});
        return;
      }
      resolve(code);
    });
  });
}

function StoreAuthCredentials(attempt, payload) {
  return new Promise(function(resolve) {
    if (activeAuthAttempt !== attempt) {
      resolve({error: 'stale'});
      return;
    }
    chrome.storage.local.get(['radarToken', 'radarRefreshToken', 'radarClientId'], function(items) {
      var lastError = chrome.runtime.lastError;
      if (lastError) {
        resolve({error: 'transient'});
        return;
      }
      items = items || {};
      var storedToken = (typeof items.radarToken == 'undefined') ? null : items.radarToken;
      var storedRefreshToken = (typeof items.radarRefreshToken == 'undefined') ? null : items.radarRefreshToken;
      var storedClientId = (typeof items.radarClientId == 'undefined') ? null : items.radarClientId;
      if (activeAuthAttempt !== attempt || storedToken != attempt.initialToken ||
          storedRefreshToken != attempt.initialRefreshToken ||
          storedClientId != attempt.initialClientId) {
        resolve({error: 'stale'});
        return;
      }
      chrome.storage.local.set({
        radarToken: payload.access_token,
        radarRefreshToken: payload.refresh_token,
        radarClientId: ESI_CLIENT_ID
      }, function() {
        var setLastError = chrome.runtime.lastError;
        if (setLastError) {
          resolve({error: 'transient'});
          return;
        }
        resolve(activeAuthAttempt === attempt ? {} : {error: 'stale'});
      });
    });
  });
}

function FinishAuthAttempt(attempt) {
  if (activeAuthAttempt === attempt) {
    activeAuthAttempt = null;
  }
  attempt.state = null;
  attempt.verifier = null;
  attempt.redirectUri = null;
  attempt.initialToken = null;
  attempt.initialRefreshToken = null;
  attempt.initialClientId = null;
}

function RunAuthAttempt(attempt, respond) {
  Promise.resolve()
    .then(function() {
      return CreatePKCEParameters();
    })
    .then(function(parameters) {
      if (activeAuthAttempt !== attempt) {
        throw {error: 'stale'};
      }
      attempt.state = parameters.state;
      attempt.verifier = parameters.verifier;
      var authUrl = new URL(ESI_AUTHORIZE_URL);
      authUrl.search = new URLSearchParams([
        ['response_type', 'code'],
        ['client_id', ESI_CLIENT_ID],
        ['redirect_uri', attempt.redirectUri],
        ['scope', ESI_SCOPE],
        ['state', attempt.state],
        ['code_challenge', parameters.challenge],
        ['code_challenge_method', 'S256']
      ]).toString();
      return LaunchAuthFlow(attempt, authUrl.toString());
    })
    .then(function(code) {
      if (activeAuthAttempt !== attempt) {
        return {error: 'stale'};
      }
      return RequestToken(new URLSearchParams([
        ['grant_type', 'authorization_code'],
        ['code', code],
        ['client_id', ESI_CLIENT_ID],
        ['code_verifier', attempt.verifier],
        ['redirect_uri', attempt.redirectUri]
      ]), false);
    })
    .then(function(result) {
      if (activeAuthAttempt !== attempt) {
        return {error: 'stale'};
      }
      if (result.error) {
        return result;
      }
      return StoreAuthCredentials(attempt, result);
    })
    .then(function(result) {
      FinishAuthAttempt(attempt);
      respond(result);
    })
    .catch(function(error) {
      FinishAuthAttempt(attempt);
      respond(error && error.error ? error : {error: 'transient'});
    });
}

function StartAuth(sendResponse) {
  var respond = RespondOnce(sendResponse);
  if (activeAuthAttempt !== null) {
    respond({error: 'busy'});
    return false;
  }

  var redirectUri;
  try {
    redirectUri = chrome.identity.getRedirectURL();
  }
  catch (error) {
    respond({error: 'configuration'});
    return false;
  }
  if (redirectUri != ESI_REDIRECT_URI) {
    respond({error: 'configuration'});
    return false;
  }

  var attempt = {state: null, verifier: null, redirectUri: redirectUri};
  activeAuthAttempt = attempt;
  chrome.storage.local.get(['radarToken', 'radarRefreshToken', 'radarClientId'], function(items) {
    var lastError = chrome.runtime.lastError;
    if (lastError) {
      FinishAuthAttempt(attempt);
      respond({error: 'transient'});
      return;
    }
    items = items || {};
    attempt.initialToken = (typeof items.radarToken == 'undefined') ? null : items.radarToken;
    attempt.initialRefreshToken = (typeof items.radarRefreshToken == 'undefined') ? null : items.radarRefreshToken;
    attempt.initialClientId = (typeof items.radarClientId == 'undefined') ? null : items.radarClientId;
    if (activeAuthAttempt !== attempt) {
      FinishAuthAttempt(attempt);
      respond({error: 'stale'});
      return;
    }
    RunAuthAttempt(attempt, respond);
  });
  return true;
}

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (!request) {
      return;
    }
    if (request.contentScriptQuery == 'startAuth') {
      return StartAuth(sendResponse);
    }
    else if (request.contentScriptQuery == 'refreshToken') {
      RequestToken(new URLSearchParams([
        ['grant_type', 'refresh_token'],
        ['refresh_token', request.tokenArg],
        ['client_id', ESI_CLIENT_ID]
      ]), true)
      .then(function(result) {
        sendResponse(result);
      });
      return true;
    }
    else if (request.contentScriptQuery == 'revokeToken') {
      activeAuthAttempt = null;
      var respond = RespondOnce(sendResponse);
      var revoke = function(tokenToRevoke, tokenTypeHint) {
        return Promise.resolve()
          .then(function() {
            return fetch(ESI_REVOKE_URL, {
              method: 'post',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams([
                ['token_type_hint', tokenTypeHint],
                ['token', tokenToRevoke],
                ['client_id', ESI_CLIENT_ID]
              ])
            });
          })
          .then(function(response) {
            return response.status >= 200 && response.status < 300;
          })
          .catch(function() {
            return false;
          });
      };

      Promise.all([
        revoke(request.token, 'access_token'),
        revoke(request.refreshToken, 'refresh_token')
      ])
      .then(function(results) {
        respond(results[0] && results[1]);
      })
      .catch(function() {
        respond(false);
      });
      return true;
    }
  });
