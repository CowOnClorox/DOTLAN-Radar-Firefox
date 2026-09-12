var ESI_CLIENT_ID = 'f7b4d46e9ec2494481e8a40fd860540a';
var ESI_REDIRECT_URI = 'https://fd9b2657a6e126c6265245caa1535e6e348a22c2.extensions.allizom.org/';
var ESI_AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
var ESI_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
var ESI_REVOKE_URL = 'https://login.eveonline.com/v2/oauth/revoke';
var ESI_SCOPE = 'esi-location.read_location.v1 esi-ui.write_waypoint.v1';
var activeAuthAttempt = null;
var credentialMutationQueue = Promise.resolve();
var credentialMutationGeneration = 0;
var credentialMutationsPending = [];

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

function NormalizeStoredCredentials(items) {
  items = items || {};
  return {
    token: (typeof items.radarToken == 'undefined') ? null : items.radarToken,
    refreshToken: (typeof items.radarRefreshToken == 'undefined') ? null : items.radarRefreshToken,
    clientId: (typeof items.radarClientId == 'undefined') ? null : items.radarClientId
  };
}

function ReadStoredCredentials() {
  return new Promise(function(resolve, reject) {
    try {
      chrome.storage.local.get(['radarToken', 'radarRefreshToken', 'radarClientId'], function(items) {
        var lastError = chrome.runtime.lastError;
        if (lastError) {
          reject({error: 'transient'});
          return;
        }
        resolve(NormalizeStoredCredentials(items));
      });
    }
    catch (error) {
      reject({error: 'transient'});
    }
  });
}

function WriteStoredCredentials(credentials) {
  return new Promise(function(resolve, reject) {
    try {
      chrome.storage.local.set({
        radarToken: credentials.token,
        radarRefreshToken: credentials.refreshToken,
        radarClientId: credentials.clientId
      }, function() {
        var lastError = chrome.runtime.lastError;
        if (lastError) {
          reject({error: 'transient'});
          return;
        }
        resolve();
      });
    }
    catch (error) {
      reject({error: 'transient'});
    }
  });
}

function StoredCredentialsMatch(actual, expected) {
  return actual.token == expected.token && actual.refreshToken == expected.refreshToken &&
    actual.clientId == expected.clientId;
}

function StoredCredentialsEmpty(credentials) {
  return credentials.token == null && credentials.refreshToken == null && credentials.clientId == null;
}

function EnqueueCredentialMutation(operation, kind, expected) {
  var operationGeneration = credentialMutationGeneration;
  var pendingMutation = {kind: kind, expected: expected};
  credentialMutationsPending.push(pendingMutation);
  var result = credentialMutationQueue.then(function() {
    if (operationGeneration != credentialMutationGeneration) {
      return {error: 'stale'};
    }
    return operation(operationGeneration);
  }).catch(function() {
    return {error: 'transient'};
  });
  credentialMutationQueue = result.then(function(value) {
    credentialMutationsPending.splice(credentialMutationsPending.indexOf(pendingMutation), 1);
    return value;
  });
  return credentialMutationQueue;
}

function QueueCredentialWrite(credentials, expected, allowCleared) {
  if (!credentials || typeof credentials.token != 'string' || credentials.token.length == 0 ||
      typeof credentials.refreshToken != 'string' || credentials.refreshToken.length == 0 ||
      credentials.clientId != ESI_CLIENT_ID) {
    return Promise.resolve({error: 'transient'});
  }
  return EnqueueCredentialMutation(function(operationGeneration) {
    return ReadStoredCredentials()
      .then(function(current) {
        if (!StoredCredentialsMatch(current, expected) && !(allowCleared && StoredCredentialsEmpty(current))) {
          return {error: 'stale'};
        }
        return WriteStoredCredentials(credentials)
          .then(function() {
            return operationGeneration == credentialMutationGeneration ? {} : {error: 'stale'};
          });
      });
  }, 'write', expected);
}

function QueueCredentialClear(expected, force) {
  return EnqueueCredentialMutation(function(operationGeneration) {
    return ReadStoredCredentials()
      .then(function(current) {
        if (!force && !StoredCredentialsMatch(current, expected)) {
          return {error: 'stale'};
        }
        return WriteStoredCredentials({token: null, refreshToken: null, clientId: null})
          .then(function() {
            return operationGeneration == credentialMutationGeneration ? {} : {error: 'stale'};
          });
      });
  }, 'clear', expected);
}

function PendingCredentialWriteMatches(expected) {
  return credentialMutationsPending.some(function(mutation) {
    return mutation.kind == 'write' && StoredCredentialsMatch(mutation.expected, expected);
  });
}

function ActiveAuthAttemptMatches(expected) {
  return activeAuthAttempt !== null &&
    activeAuthAttempt.initialToken == expected.token &&
    activeAuthAttempt.initialRefreshToken == expected.refreshToken &&
    activeAuthAttempt.initialClientId == expected.clientId;
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
    QueueCredentialWrite({
      token: payload.access_token,
      refreshToken: payload.refresh_token,
      clientId: ESI_CLIENT_ID
    }, {
      token: attempt.initialToken,
      refreshToken: attempt.initialRefreshToken,
      clientId: attempt.initialClientId
    }, true).then(function(result) {
      resolve(activeAuthAttempt === attempt ? result : {error: 'stale'});
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
      var refreshRespond = RespondOnce(sendResponse);
      RequestToken(new URLSearchParams([
        ['grant_type', 'refresh_token'],
        ['refresh_token', request.tokenArg],
        ['client_id', ESI_CLIENT_ID]
      ]), true)
      .then(function(result) {
        refreshRespond(result);
      });
      return true;
    }
    else if (request.contentScriptQuery == 'storeCredentials') {
      var storeRespond = RespondOnce(sendResponse);
      QueueCredentialWrite({
        token: request.token,
        refreshToken: request.refreshToken,
        clientId: ESI_CLIENT_ID
      }, {
        token: request.expectedToken,
        refreshToken: request.expectedRefreshToken,
        clientId: request.expectedClientId
      }).then(function(result) {
        storeRespond(result);
      });
      return true;
    }
    else if (request.contentScriptQuery == 'clearCredentials') {
      var clearRespond = RespondOnce(sendResponse);
      QueueCredentialClear({
        token: request.expectedToken,
        refreshToken: request.expectedRefreshToken,
        clientId: request.expectedClientId
      }).then(function(result) {
        clearRespond(result);
      });
      return true;
    }
    else if (request.contentScriptQuery == 'revokeToken') {
      var revokeCredentials = {
        token: request.token,
        refreshToken: request.refreshToken,
        clientId: (typeof request.clientId == 'undefined') ? ESI_CLIENT_ID : request.clientId
      };
      var forceCredentialClear = PendingCredentialWriteMatches(revokeCredentials) ||
        ActiveAuthAttemptMatches(revokeCredentials);
      activeAuthAttempt = null;
      credentialMutationGeneration += 1;
      var respond = RespondOnce(sendResponse);
      var clearCredentials = QueueCredentialClear(revokeCredentials, forceCredentialClear);
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
        clearCredentials,
        revoke(request.token, 'access_token'),
        revoke(request.refreshToken, 'refresh_token')
      ])
      .then(function(results) {
        respond(results[1] && results[2]);
      })
      .catch(function() {
        respond(false);
      });
      return true;
    }
  });
