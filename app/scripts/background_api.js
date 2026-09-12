var ESI_CLIENT_ID = 'f7b4d46e9ec2494481e8a40fd860540a';
var ESI_REDIRECT_URI = 'https://fd9b2657a6e126c6265245caa1535e6e348a22c2.extensions.allizom.org/';
var ESI_AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
var ESI_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
var ESI_REVOKE_URL = 'https://login.eveonline.com/v2/oauth/revoke';
var ESI_METADATA_URL = 'https://login.eveonline.com/.well-known/oauth-authorization-server';
var ESI_JWKS_ORIGIN = 'https://login.eveonline.com';
var ESI_SCOPE = 'esi-location.read_location.v1 esi-ui.write_waypoint.v1';
var ESI_FETCH_TIMEOUT_MS = 5000;
var ESI_JWKS_CACHE_TTL_MS = 300000;
var esiJwksCache = null;
var esiJwksFetchPromise = null;
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

function DecodeBase64Url(value) {
  if (typeof value != 'string' || value.length == 0 ||
      !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 == 1) {
    return null;
  }
  try {
    var padded = value.replace(/-/g, '+').replace(/_/g, '/');
    while (padded.length % 4 != 0) {
      padded += '=';
    }
    var binary = atob(padded);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  catch (error) {
    return null;
  }
}

function DecodeJwtJson(value) {
  var bytes = DecodeBase64Url(value);
  if (bytes == null) {
    return null;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  }
  catch (error) {
    return null;
  }
}

function ParseAccessToken(token) {
  if (typeof token != 'string') {
    return null;
  }
  var parts = token.split('.');
  if (parts.length != 3 || parts[0].length == 0 || parts[1].length == 0 || parts[2].length == 0) {
    return null;
  }
  var header = DecodeJwtJson(parts[0]);
  var payload = DecodeJwtJson(parts[1]);
  var signature = DecodeBase64Url(parts[2]);
  if (!header || typeof header != 'object' || Array.isArray(header) ||
      !payload || typeof payload != 'object' || Array.isArray(payload) ||
      signature == null || signature.length == 0 ||
      typeof header.alg != 'string' ||
      (header.alg !== 'RS256' && header.alg !== 'ES256') ||
      typeof header.kid != 'string' || header.kid.trim().length == 0) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(header, 'crit') &&
      (!Array.isArray(header.crit) || header.crit.length != 0)) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(header, 'jku') ||
      Object.prototype.hasOwnProperty.call(header, 'x5u') ||
      Object.prototype.hasOwnProperty.call(header, 'jwk')) {
    return null;
  }
  if (header.alg === 'ES256' && signature.length != 64) {
    return null;
  }
  return {
    header: header,
    payload: payload,
    signature: signature,
    signingInput: new TextEncoder().encode(parts[0] + '.' + parts[1])
  };
}

/* EVE metadata uses https://login.eveonline.com. EVE documents the trailing-slash
 * and bare-host compatibility forms; the similar-looking "logineveonline.com"
 * typo is intentionally not accepted. */
function IsAcceptedIssuer(issuer) {
  return typeof issuer == 'string' &&
    (issuer === 'https://login.eveonline.com/' ||
      issuer === 'https://login.eveonline.com' || issuer === 'login.eveonline.com');
}

function ArrayContains(values, expected) {
  return Array.isArray(values) && values.indexOf(expected) != -1;
}

function ValidateAccessTokenClaims(claims) {
  var now = Date.now() / 1000;
  if (!IsAcceptedIssuer(claims.iss) || !ArrayContains(claims.aud, ESI_CLIENT_ID) ||
      !ArrayContains(claims.aud, 'EVE Online') ||
      typeof claims.exp != 'number' || !isFinite(claims.exp) || claims.exp <= now ||
      (Object.prototype.hasOwnProperty.call(claims, 'nbf') &&
        (typeof claims.nbf != 'number' || !isFinite(claims.nbf) || claims.nbf > now)) ||
      typeof claims.sub != 'string' || !/^CHARACTER:EVE:[0-9]+$/.test(claims.sub) ||
      typeof claims.name != 'string' || claims.name.trim().length == 0 ||
      !ArrayContains(claims.scp, 'esi-location.read_location.v1') ||
      !ArrayContains(claims.scp, 'esi-ui.write_waypoint.v1')) {
    return false;
  }
  return true;
}

function FetchWithTimeout(url, options) {
  return new Promise(function(resolve, reject) {
    var controller = null;
    var requestOptions = options || {};
    if (typeof AbortController == 'function') {
      controller = new AbortController();
      requestOptions.signal = controller.signal;
    }
    var settled = false;
    var responseBodyPromise = null;
    var responseBodyReject = null;
    var timeout = setTimeout(function() {
      if (settled) {
        return;
      }
      settled = true;
      if (controller) {
        controller.abort();
      }
      if (responseBodyReject != null) {
        var rejectBody = responseBodyReject;
        responseBodyReject = null;
        rejectBody({error: 'transient'});
        return;
      }
      reject({error: 'transient'});
    }, ESI_FETCH_TIMEOUT_MS);
    try {
      Promise.resolve(fetch(url, requestOptions))
        .then(function(response) {
          if (settled) {
            return;
          }
          if (!response || typeof response.json != 'function') {
            settled = true;
            clearTimeout(timeout);
            reject({error: 'transient'});
            return;
          }
          var timedResponse = {
            status: response.status,
            redirected: response.redirected
          };
          timedResponse.json = function() {
            if (responseBodyPromise != null) {
              return responseBodyPromise;
            }
            if (settled) {
              return Promise.reject({error: 'transient'});
            }
            responseBodyPromise = new Promise(function(resolveBody, rejectBody) {
              responseBodyReject = rejectBody;
              Promise.resolve()
                .then(function() {
                  return response.json();
                })
                .then(function(body) {
                  if (settled) {
                    return;
                  }
                  settled = true;
                  responseBodyReject = null;
                  clearTimeout(timeout);
                  resolveBody(body);
                })
                .catch(function() {
                  if (settled) {
                    return;
                  }
                  settled = true;
                  responseBodyReject = null;
                  clearTimeout(timeout);
                  rejectBody({error: 'transient'});
                });
            });
            return responseBodyPromise;
          };
          resolve(timedResponse);
        })
        .catch(function() {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeout);
          reject({error: 'transient'});
        });
    }
    catch (error) {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject({error: 'transient'});
      }
    }
  });
}

function FetchJson(url) {
  return FetchWithTimeout(url, {redirect: 'error', credentials: 'omit'})
    .then(function(response) {
      if (!response || response.redirected === true || response.status < 200 || response.status >= 300 ||
          typeof response.json != 'function') {
        throw {error: 'transient'};
      }
      return Promise.resolve(response.json()).catch(function() {
        throw {error: 'transient'};
      });
    });
}

function IsTrustedJwkForToken(jwk, header) {
  if (!jwk || typeof jwk != 'object' || Array.isArray(jwk) ||
      typeof jwk.kid != 'string' || jwk.kid.length == 0 || jwk.kid !== header.kid ||
      typeof jwk.alg != 'string' || jwk.alg !== header.alg ||
      typeof jwk.use != 'string' || jwk.use !== 'sig' ||
      (Object.prototype.hasOwnProperty.call(jwk, 'key_ops') &&
        (!Array.isArray(jwk.key_ops) || jwk.key_ops.indexOf('verify') == -1))) {
    return false;
  }
  if (header.alg === 'RS256') {
    return typeof jwk.kty == 'string' && jwk.kty === 'RSA' && typeof jwk.n == 'string' && jwk.n.length > 0 &&
      typeof jwk.e == 'string' && jwk.e.length > 0;
  }
  return typeof jwk.kty == 'string' && jwk.kty === 'EC' && typeof jwk.crv == 'string' && jwk.crv === 'P-256' &&
    typeof jwk.x == 'string' && jwk.x.length > 0 &&
    typeof jwk.y == 'string' && jwk.y.length > 0;
}

function SelectVerificationJwk(jwks, header) {
  if (!jwks || typeof jwks != 'object' || Array.isArray(jwks) || !Array.isArray(jwks.keys) ||
      jwks.keys.length == 0 || jwks.keys.length > 32) {
    return null;
  }
  var keysWithKid = jwks.keys.filter(function(jwk) {
    return jwk && typeof jwk.kid == 'string' && jwk.kid === header.kid;
  });
  if (keysWithKid.length != 1 || !IsTrustedJwkForToken(keysWithKid[0], header)) {
    return null;
  }
  return keysWithKid[0];
}

function FetchJwks(forceRefresh) {
  var now = Date.now();
  if (forceRefresh) {
    esiJwksCache = null;
  }
  if (!forceRefresh && esiJwksCache != null && esiJwksCache.expiresAt > now) {
    return Promise.resolve(esiJwksCache.value);
  }
  if (esiJwksFetchPromise != null) {
    return esiJwksFetchPromise;
  }
  var fetchPromise = FetchJson(ESI_METADATA_URL)
    .then(function(metadata) {
      if (!metadata || typeof metadata != 'object' || Array.isArray(metadata) ||
          typeof metadata.jwks_uri != 'string') {
        throw {error: 'transient'};
      }
      var jwksUrl;
      try {
        jwksUrl = new URL(metadata.jwks_uri);
      }
      catch (error) {
        throw {error: 'transient'};
      }
      if (jwksUrl.protocol != 'https:' || jwksUrl.origin != ESI_JWKS_ORIGIN ||
          jwksUrl.username != '' || jwksUrl.password != '' || jwksUrl.hash != '') {
        throw {error: 'transient'};
      }
      return FetchJson(jwksUrl.toString());
    })
    .then(function(jwks) {
      if (!jwks || typeof jwks != 'object' || Array.isArray(jwks) || !Array.isArray(jwks.keys) ||
          jwks.keys.length == 0 || jwks.keys.length > 32) {
        throw {error: 'transient'};
      }
      esiJwksCache = {value: jwks, expiresAt: Date.now() + ESI_JWKS_CACHE_TTL_MS};
      return jwks;
    });
  esiJwksFetchPromise = fetchPromise.then(function(value) {
    esiJwksFetchPromise = null;
    return value;
  }, function(error) {
    esiJwksFetchPromise = null;
    throw error && error.error ? error : {error: 'transient'};
  });
  return esiJwksFetchPromise;
}

function ImportVerificationKey(jwk, algorithm) {
  var importAlgorithm = algorithm === 'RS256' ? {
    name: 'RSASSA-PKCS1-v1_5',
    hash: {name: 'SHA-256'}
  } : {
    name: 'ECDSA',
    namedCurve: 'P-256'
  };
  return crypto.subtle.importKey('jwk', jwk, importAlgorithm, false, ['verify']);
}

function VerifyAccessTokenSignature(parsedToken, forceRefresh) {
  return FetchJwks(forceRefresh)
    .then(function(jwks) {
      var jwk = SelectVerificationJwk(jwks, parsedToken.header);
      if (jwk == null) {
        return false;
      }
      return ImportVerificationKey(jwk, parsedToken.header.alg)
        .then(function(key) {
          var verifyAlgorithm = parsedToken.header.alg === 'RS256' ?
            {name: 'RSASSA-PKCS1-v1_5'} : {name: 'ECDSA', hash: {name: 'SHA-256'}};
          return crypto.subtle.verify(verifyAlgorithm, key, parsedToken.signature, parsedToken.signingInput);
        })
        .catch(function() {
          return false;
        });
    });
}

function ValidateAccessToken(token) {
  var parsedToken = ParseAccessToken(token);
  if (parsedToken == null || !ValidateAccessTokenClaims(parsedToken.payload)) {
    return Promise.reject({error: 'invalid_token'});
  }
  return VerifyAccessTokenSignature(parsedToken, false)
    .then(function(valid) {
      if (valid) {
        if (!ValidateAccessTokenClaims(parsedToken.payload)) {
          throw {error: 'invalid_token'};
        }
        return parsedToken.payload;
      }
      return VerifyAccessTokenSignature(parsedToken, true)
        .then(function(rotatedValid) {
          if (!rotatedValid || !ValidateAccessTokenClaims(parsedToken.payload)) {
            throw {error: 'invalid_token'};
          }
          return parsedToken.payload;
        });
    });
}

function NormalizeTokenValidationError(error) {
  return error && error.error == 'transient' ? {error: 'transient'} : {error: 'invalid_token'};
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
      return FetchWithTimeout(ESI_TOKEN_URL, {
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
          var result = ClassifyTokenResponse(response, payload, refreshTokenOptional);
          if (result.error) {
            return result;
          }
          return ValidateAccessToken(result.access_token)
            .then(function() {
              return result;
            })
            .catch(function(error) {
              return NormalizeTokenValidationError(error);
            });
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

function CredentialsHaveValue(credentials) {
  return credentials && (credentials.token != null || credentials.refreshToken != null ||
    credentials.clientId != null);
}

function CredentialMarkerKey(credentials) {
  var value = [credentials.token || '', credentials.refreshToken || '', credentials.clientId || ''].join('\u0000');
  var firstHash = 2166136261;
  var secondHash = 2246822519;
  var thirdHash = 3266489917;
  var fourthHash = 668265263;
  for (var i = 0; i < value.length; i++) {
    var code = value.charCodeAt(i);
    firstHash = Math.imul(firstHash ^ code, 16777619);
    secondHash = Math.imul(secondHash ^ code, 2246822519);
    thirdHash = Math.imul(thirdHash ^ code, 3266489917);
    fourthHash = Math.imul(fourthHash ^ code, 668265263);
  }
  return 'radarInvalidatedSession_' + (firstHash >>> 0).toString(16) +
    (secondHash >>> 0).toString(16) + (thirdHash >>> 0).toString(16) +
    (fourthHash >>> 0).toString(16);
}

function CredentialInvalidationExists(credentials) {
  if (!CredentialsHaveValue(credentials)) {
    return Promise.resolve(false);
  }
  return new Promise(function(resolve, reject) {
    try {
      chrome.storage.local.get(CredentialMarkerKey(credentials), function(items) {
        var lastError = chrome.runtime.lastError;
        if (lastError) {
          reject({error: 'transient'});
          return;
        }
        resolve(items && items[CredentialMarkerKey(credentials)] === true);
      });
    }
    catch (error) {
      reject({error: 'transient'});
    }
  });
}

function SetCredentialInvalidation(credentials, value) {
  if (!CredentialsHaveValue(credentials)) {
    return;
  }
  var values = {};
  values[CredentialMarkerKey(credentials)] = value;
  try {
    chrome.storage.local.set(values, function() {
      var lastError = chrome.runtime.lastError;
      if (lastError) {
        return;
      }
    });
  }
  catch (error) {
    return;
  }
}

function ClearCredentialInvalidation(credentials) {
  if (!CredentialsHaveValue(credentials)) {
    return Promise.resolve();
  }
  return new Promise(function(resolve, reject) {
    var values = {};
    values[CredentialMarkerKey(credentials)] = null;
    try {
      chrome.storage.local.set(values, function() {
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
        return CredentialInvalidationExists(expected)
          .then(function(invalidated) {
            if (invalidated) {
              return {error: 'stale'};
            }
            return ValidateAccessToken(credentials.token)
              .then(function() {
                if (operationGeneration != credentialMutationGeneration) {
                  return {error: 'stale'};
                }
                return ReadStoredCredentials()
                  .then(function(currentAfterValidation) {
                    if (operationGeneration != credentialMutationGeneration ||
                        (!StoredCredentialsMatch(currentAfterValidation, expected) &&
                          !(allowCleared && StoredCredentialsEmpty(currentAfterValidation)))) {
                      return {error: 'stale'};
                    }
                    return CredentialInvalidationExists(expected)
                      .then(function(invalidatedAfterValidation) {
                        if (invalidatedAfterValidation || operationGeneration != credentialMutationGeneration) {
                          return {error: 'stale'};
                        }
                        var parsedCredentials = ParseAccessToken(credentials.token);
                        if (parsedCredentials == null || !ValidateAccessTokenClaims(parsedCredentials.payload)) {
                          return {error: 'invalid_token'};
                        }
                        return WriteStoredCredentials(credentials)
                          .then(function() {
                            return CredentialInvalidationExists(expected)
                              .then(function(invalidatedAfterWrite) {
                                if (invalidatedAfterWrite || operationGeneration != credentialMutationGeneration) {
                                  return WriteStoredCredentials({token: null, refreshToken: null, clientId: null})
                                    .then(function() {
                                      return {error: 'stale'};
                                    });
                                }
                                return operationGeneration == credentialMutationGeneration ? {} : {error: 'stale'};
                              });
                          });
                      });
                  });
              })
              .catch(function(error) {
                if (operationGeneration != credentialMutationGeneration) {
                  return {error: 'stale'};
                }
                return NormalizeTokenValidationError(error);
              });
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
    var initialCredentials = {
      token: attempt.initialToken,
      refreshToken: attempt.initialRefreshToken,
      clientId: attempt.initialClientId
    };
    CredentialInvalidationExists(initialCredentials)
      .then(function(invalidated) {
        if (activeAuthAttempt !== attempt) {
          throw {error: 'stale'};
        }
        if (!invalidated) {
          return null;
        }
        return QueueCredentialClear(initialCredentials, false)
          .then(function(result) {
            if (result && result.error == 'transient') {
              throw result;
            }
            return ClearCredentialInvalidation(initialCredentials);
          });
      })
      .then(function() {
        if (activeAuthAttempt !== attempt) {
          throw {error: 'stale'};
        }
        RunAuthAttempt(attempt, respond);
      })
      .catch(function(error) {
        FinishAuthAttempt(attempt);
        respond(error && error.error ? error : {error: 'transient'});
      });
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
      var ownsActiveAuthAttempt = ActiveAuthAttemptMatches(revokeCredentials);
      var forceCredentialClear = PendingCredentialWriteMatches(revokeCredentials) ||
        ownsActiveAuthAttempt;
      if (ownsActiveAuthAttempt) {
        activeAuthAttempt = null;
      }
      if (forceCredentialClear) {
        credentialMutationGeneration += 1;
      }
      SetCredentialInvalidation(revokeCredentials, true);
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
