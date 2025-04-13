// ==UserScript==
// @name         livechart.me utilities
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Add watch links to livechart.me timetable
// @author       You
// @match        https://www.livechart.me/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=livechart.me
// @grant        none
// @updateURL    https://raw.githubusercontent.com/olee/livechart.me-decorator/refs/heads/master/build/index.global.js
// @downloadURL  https://raw.githubusercontent.com/olee/livechart.me-decorator/refs/heads/master/build/index.global.js
// ==/UserScript==
"use strict";
(() => {
  // src/jsx-factory.ts
  function createElement(tag, props, ...children) {
    if (typeof tag === "function") {
      return tag(props, ...children);
    }
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(props || {})) {
      if (name.startsWith("on") && name.toLowerCase() in window) {
        element.addEventListener(name.toLowerCase().substr(2), value);
      } else if (name === "ref") {
        value._set(element);
      } else {
        element.setAttribute(name, value.toString());
      }
    }
    for (const child of children) {
      appendChild(element, child);
    }
    return element;
  }
  function appendChild(parent, child) {
    if (Array.isArray(child))
      child.forEach((nestedChild) => appendChild(parent, nestedChild));
    else
      parent.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  function createFragment(props, ...children) {
    return children;
  }
  function createRef() {
    const ref = {
      current: null,
      _set: (el) => ref.current = el
    };
    return ref;
  }

  // src/genql/runtime/error.ts
  var GenqlError = class extends Error {
    errors = [];
    /**
     * Partial data returned by the server
     */
    data;
    constructor(errors, data) {
      let message = Array.isArray(errors) ? errors.map((x) => x?.message || "").join("\n") : "";
      if (!message) {
        message = "GraphQL error";
      }
      super(message);
      this.errors = errors;
      this.data = data;
    }
  };

  // src/genql/runtime/batcher.ts
  function dispatchQueueBatch(client, queue) {
    let batchedQuery = queue.map((item) => item.request);
    if (batchedQuery.length === 1) {
      batchedQuery = batchedQuery[0];
    }
    (() => {
      try {
        return client.fetcher(batchedQuery);
      } catch (e) {
        return Promise.reject(e);
      }
    })().then((responses) => {
      if (queue.length === 1 && !Array.isArray(responses)) {
        if (responses.errors && responses.errors.length) {
          queue[0].reject(
            new GenqlError(responses.errors, responses.data)
          );
          return;
        }
        queue[0].resolve(responses);
        return;
      } else if (responses.length !== queue.length) {
        throw new Error("response length did not match query length");
      }
      for (let i = 0; i < queue.length; i++) {
        if (responses[i].errors && responses[i].errors.length) {
          queue[i].reject(
            new GenqlError(responses[i].errors, responses[i].data)
          );
        } else {
          queue[i].resolve(responses[i]);
        }
      }
    }).catch((e) => {
      for (let i = 0; i < queue.length; i++) {
        queue[i].reject(e);
      }
    });
  }
  function dispatchQueue(client, options) {
    const queue = client._queue;
    const maxBatchSize = options.maxBatchSize || 0;
    client._queue = [];
    if (maxBatchSize > 0 && maxBatchSize < queue.length) {
      for (let i = 0; i < queue.length / maxBatchSize; i++) {
        dispatchQueueBatch(
          client,
          queue.slice(i * maxBatchSize, (i + 1) * maxBatchSize)
        );
      }
    } else {
      dispatchQueueBatch(client, queue);
    }
  }
  var QueryBatcher = class _QueryBatcher {
    fetcher;
    _options;
    _queue;
    constructor(fetcher, {
      batchInterval = 6,
      shouldBatch = true,
      maxBatchSize = 0
    } = {}) {
      this.fetcher = fetcher;
      this._options = {
        batchInterval,
        shouldBatch,
        maxBatchSize
      };
      this._queue = [];
    }
    /**
     * Fetch will send a graphql request and return the parsed json.
     * @param {string}      query          - the graphql query.
     * @param {Variables}   variables      - any variables you wish to inject as key/value pairs.
     * @param {[string]}    operationName  - the graphql operationName.
     * @param {Options}     overrides      - the client options overrides.
     *
     * @return {promise} resolves to parsed json of server response
     *
     * @example
     * client.fetch(`
     *    query getHuman($id: ID!) {
     *      human(id: $id) {
     *        name
     *        height
     *      }
     *    }
     * `, { id: "1001" }, 'getHuman')
     *    .then(human => {
     *      // do something with human
     *      console.log(human);
     *    });
     */
    fetch(query, variables, operationName, overrides = {}) {
      const request = {
        query
      };
      const options = Object.assign({}, this._options, overrides);
      if (variables) {
        request.variables = variables;
      }
      if (operationName) {
        request.operationName = operationName;
      }
      const promise = new Promise((resolve, reject) => {
        this._queue.push({
          request,
          resolve,
          reject
        });
        if (this._queue.length === 1) {
          if (options.shouldBatch) {
            setTimeout(
              () => dispatchQueue(this, options),
              options.batchInterval
            );
          } else {
            dispatchQueue(this, options);
          }
        }
      });
      return promise;
    }
    /**
     * Fetch will send a graphql request and return the parsed json.
     * @param {string}      query          - the graphql query.
     * @param {Variables}   variables      - any variables you wish to inject as key/value pairs.
     * @param {[string]}    operationName  - the graphql operationName.
     * @param {Options}     overrides      - the client options overrides.
     *
     * @return {Promise<Array<Result>>} resolves to parsed json of server response
     *
     * @example
     * client.forceFetch(`
     *    query getHuman($id: ID!) {
     *      human(id: $id) {
     *        name
     *        height
     *      }
     *    }
     * `, { id: "1001" }, 'getHuman')
     *    .then(human => {
     *      // do something with human
     *      console.log(human);
     *    });
     */
    forceFetch(query, variables, operationName, overrides = {}) {
      const request = {
        query
      };
      const options = Object.assign({}, this._options, overrides, {
        shouldBatch: false
      });
      if (variables) {
        request.variables = variables;
      }
      if (operationName) {
        request.operationName = operationName;
      }
      const promise = new Promise((resolve, reject) => {
        const client = new _QueryBatcher(this.fetcher, this._options);
        client._queue = [
          {
            request,
            resolve,
            reject
          }
        ];
        dispatchQueue(client, options);
      });
      return promise;
    }
  };

  // src/genql/runtime/fetcher.ts
  var DEFAULT_BATCH_OPTIONS = {
    maxBatchSize: 10,
    batchInterval: 40
  };
  var createFetcher = ({
    url,
    headers = {},
    fetcher,
    fetch: _fetch,
    batch = false,
    ...rest
  }) => {
    if (!url && !fetcher) {
      throw new Error("url or fetcher is required");
    }
    fetcher = fetcher || (async (body) => {
      let headersObject = typeof headers == "function" ? await headers() : headers;
      headersObject = headersObject || {};
      if (typeof fetch === "undefined" && !_fetch) {
        throw new Error(
          "Global `fetch` function is not available, pass a fetch polyfill to Genql `createClient`"
        );
      }
      let fetchImpl = _fetch || fetch;
      const res = await fetchImpl(url, {
        headers: {
          "Content-Type": "application/json",
          ...headersObject
        },
        method: "POST",
        body: JSON.stringify(body),
        ...rest
      });
      if (!res.ok) {
        throw new Error(`${res.statusText}: ${await res.text()}`);
      }
      const json = await res.json();
      return json;
    });
    if (!batch) {
      return async (body) => {
        const json = await fetcher(body);
        if (Array.isArray(json)) {
          return json.map((json2) => {
            if (json2?.errors?.length) {
              throw new GenqlError(json2.errors || [], json2.data);
            }
            return json2.data;
          });
        } else {
          if (json?.errors?.length) {
            throw new GenqlError(json.errors || [], json.data);
          }
          return json.data;
        }
      };
    }
    const batcher = new QueryBatcher(
      async (batchedQuery) => {
        const json = await fetcher(batchedQuery);
        return json;
      },
      batch === true ? DEFAULT_BATCH_OPTIONS : batch
    );
    return async ({ query, variables }) => {
      const json = await batcher.fetch(query, variables);
      if (json?.data) {
        return json.data;
      }
      throw new Error(
        "Genql batch fetcher returned unexpected result " + JSON.stringify(json)
      );
    };
  };

  // src/genql/runtime/generateGraphqlOperation.ts
  var parseRequest = (request, ctx, path) => {
    if (typeof request === "object" && "__args" in request) {
      const args = request.__args;
      let fields = { ...request };
      delete fields.__args;
      const argNames = Object.keys(args);
      if (argNames.length === 0) {
        return parseRequest(fields, ctx, path);
      }
      const field = getFieldFromPath(ctx.root, path);
      const argStrings = argNames.map((argName) => {
        ctx.varCounter++;
        const varName = `v${ctx.varCounter}`;
        const typing = field.args && field.args[argName];
        if (!typing) {
          throw new Error(
            `no typing defined for argument \`${argName}\` in path \`${path.join(
              "."
            )}\``
          );
        }
        ctx.variables[varName] = {
          value: args[argName],
          typing
        };
        return `${argName}:$${varName}`;
      });
      return `(${argStrings})${parseRequest(fields, ctx, path)}`;
    } else if (typeof request === "object" && Object.keys(request).length > 0) {
      const fields = request;
      const fieldNames = Object.keys(fields).filter((k) => Boolean(fields[k]));
      if (fieldNames.length === 0) {
        throw new Error(
          `field selection should not be empty: ${path.join(".")}`
        );
      }
      const type = path.length > 0 ? getFieldFromPath(ctx.root, path).type : ctx.root;
      const scalarFields = type.scalar;
      let scalarFieldsFragment;
      if (fieldNames.includes("__scalar")) {
        const falsyFieldNames = new Set(
          Object.keys(fields).filter((k) => !Boolean(fields[k]))
        );
        if (scalarFields?.length) {
          ctx.fragmentCounter++;
          scalarFieldsFragment = `f${ctx.fragmentCounter}`;
          ctx.fragments.push(
            `fragment ${scalarFieldsFragment} on ${type.name}{${scalarFields.filter((f) => !falsyFieldNames.has(f)).join(",")}}`
          );
        }
      }
      const fieldsSelection = fieldNames.filter((f) => !["__scalar", "__name"].includes(f)).map((f) => {
        const parsed = parseRequest(fields[f], ctx, [...path, f]);
        if (f.startsWith("on_")) {
          ctx.fragmentCounter++;
          const implementationFragment = `f${ctx.fragmentCounter}`;
          const typeMatch = f.match(/^on_(.+)/);
          if (!typeMatch || !typeMatch[1])
            throw new Error("match failed");
          ctx.fragments.push(
            `fragment ${implementationFragment} on ${typeMatch[1]}${parsed}`
          );
          return `...${implementationFragment}`;
        } else {
          return `${f}${parsed}`;
        }
      }).concat(scalarFieldsFragment ? [`...${scalarFieldsFragment}`] : []).join(",");
      return `{${fieldsSelection}}`;
    } else {
      return "";
    }
  };
  var generateGraphqlOperation = (operation, root, fields) => {
    const ctx = {
      root,
      varCounter: 0,
      variables: {},
      fragmentCounter: 0,
      fragments: []
    };
    const result = parseRequest(fields, ctx, []);
    const varNames = Object.keys(ctx.variables);
    const varsString = varNames.length > 0 ? `(${varNames.map((v) => {
      const variableType = ctx.variables[v].typing[1];
      return `$${v}:${variableType}`;
    })})` : "";
    const operationName = fields?.__name || "";
    return {
      query: [
        `${operation} ${operationName}${varsString}${result}`,
        ...ctx.fragments
      ].join(","),
      variables: Object.keys(ctx.variables).reduce(
        (r, v) => {
          r[v] = ctx.variables[v].value;
          return r;
        },
        {}
      ),
      ...operationName ? { operationName: operationName.toString() } : {}
    };
  };
  var getFieldFromPath = (root, path) => {
    let current;
    if (!root)
      throw new Error("root type is not provided");
    if (path.length === 0)
      throw new Error(`path is empty`);
    path.forEach((f) => {
      const type = current ? current.type : root;
      if (!type.fields)
        throw new Error(`type \`${type.name}\` does not have fields`);
      const possibleTypes = Object.keys(type.fields).filter((i) => i.startsWith("on_")).reduce(
        (types, fieldName) => {
          const field2 = type.fields && type.fields[fieldName];
          if (field2)
            types.push(field2.type);
          return types;
        },
        [type]
      );
      let field = null;
      possibleTypes.forEach((type2) => {
        const found = type2.fields && type2.fields[f];
        if (found)
          field = found;
      });
      if (!field)
        throw new Error(
          `type \`${type.name}\` does not have a field \`${f}\``
        );
      current = field;
    });
    return current;
  };

  // src/genql/runtime/createClient.ts
  var createClient = ({
    queryRoot,
    mutationRoot,
    subscriptionRoot,
    ...options
  }) => {
    const fetcher = createFetcher(options);
    const client = {};
    if (queryRoot) {
      client.query = (request) => {
        if (!queryRoot)
          throw new Error("queryRoot argument is missing");
        const resultPromise = fetcher(
          generateGraphqlOperation("query", queryRoot, request)
        );
        return resultPromise;
      };
    }
    if (mutationRoot) {
      client.mutation = (request) => {
        if (!mutationRoot)
          throw new Error("mutationRoot argument is missing");
        const resultPromise = fetcher(
          generateGraphqlOperation("mutation", mutationRoot, request)
        );
        return resultPromise;
      };
    }
    return client;
  };

  // src/genql/runtime/linkTypeMap.ts
  var linkTypeMap = (typeMap2) => {
    const indexToName = Object.assign(
      {},
      ...Object.keys(typeMap2.types).map((k, i) => ({ [i]: k }))
    );
    let intermediaryTypeMap = Object.assign(
      {},
      ...Object.keys(typeMap2.types || {}).map(
        (k) => {
          const type = typeMap2.types[k];
          const fields = type || {};
          return {
            [k]: {
              name: k,
              // type scalar properties
              scalar: Object.keys(fields).filter((f) => {
                const [type2] = fields[f] || [];
                const isScalar = type2 && typeMap2.scalars.includes(type2);
                if (!isScalar) {
                  return false;
                }
                const args = fields[f]?.[1];
                const argTypes = Object.values(args || {}).map((x) => x?.[1]).filter(Boolean);
                const hasRequiredArgs = argTypes.some(
                  (str) => str && str.endsWith("!")
                );
                if (hasRequiredArgs) {
                  return false;
                }
                return true;
              }),
              // fields with corresponding `type` and `args`
              fields: Object.assign(
                {},
                ...Object.keys(fields).map(
                  (f) => {
                    const [typeIndex, args] = fields[f] || [];
                    if (typeIndex == null) {
                      return {};
                    }
                    return {
                      [f]: {
                        // replace index with type name
                        type: indexToName[typeIndex],
                        args: Object.assign(
                          {},
                          ...Object.keys(args || {}).map(
                            (k2) => {
                              if (!args || !args[k2]) {
                                return;
                              }
                              const [
                                argTypeName,
                                argTypeString
                              ] = args[k2];
                              return {
                                [k2]: [
                                  indexToName[argTypeName],
                                  argTypeString || indexToName[argTypeName]
                                ]
                              };
                            }
                          )
                        )
                      }
                    };
                  }
                )
              )
            }
          };
        }
      )
    );
    const res = resolveConcreteTypes(intermediaryTypeMap);
    return res;
  };
  var resolveConcreteTypes = (linkedTypeMap) => {
    Object.keys(linkedTypeMap).forEach((typeNameFromKey) => {
      const type = linkedTypeMap[typeNameFromKey];
      if (!type.fields) {
        return;
      }
      const fields = type.fields;
      Object.keys(fields).forEach((f) => {
        const field = fields[f];
        if (field.args) {
          const args = field.args;
          Object.keys(args).forEach((key) => {
            const arg = args[key];
            if (arg) {
              const [typeName2] = arg;
              if (typeof typeName2 === "string") {
                if (!linkedTypeMap[typeName2]) {
                  linkedTypeMap[typeName2] = { name: typeName2 };
                }
                arg[0] = linkedTypeMap[typeName2];
              }
            }
          });
        }
        const typeName = field.type;
        if (typeof typeName === "string") {
          if (!linkedTypeMap[typeName]) {
            linkedTypeMap[typeName] = { name: typeName };
          }
          field.type = linkedTypeMap[typeName];
        }
      });
    });
    return linkedTypeMap;
  };

  // src/genql/types.ts
  var types_default = {
    "scalars": [
      7,
      8,
      16,
      19,
      26,
      27,
      31,
      33,
      34,
      36,
      41,
      43,
      44,
      46,
      47,
      62,
      68,
      69,
      73,
      74,
      75,
      76,
      77,
      79,
      91,
      92,
      95,
      96,
      100,
      109,
      110,
      116,
      117,
      119,
      121,
      126,
      131,
      135,
      139,
      143,
      145,
      146,
      155,
      158,
      171,
      172,
      177,
      182
    ],
    "types": {
      "ActivityLikeNotification": {
        "activity": [
          9
        ],
        "activityId": [
          44
        ],
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "type": [
          100
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ActivityMentionNotification": {
        "activity": [
          9
        ],
        "activityId": [
          44
        ],
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "type": [
          100
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ActivityMessageNotification": {
        "activityId": [
          44
        ],
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "message": [
          93
        ],
        "type": [
          100
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ActivityReply": {
        "activityId": [
          44
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "isLiked": [
          19
        ],
        "likeCount": [
          44
        ],
        "likes": [
          159
        ],
        "text": [
          139,
          {
            "asHtml": [
              19
            ]
          }
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ActivityReplyLikeNotification": {
        "activity": [
          9
        ],
        "activityId": [
          44
        ],
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "type": [
          100
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ActivityReplyNotification": {
        "activity": [
          9
        ],
        "activityId": [
          44
        ],
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "type": [
          100
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ActivityReplySubscribedNotification": {
        "activity": [
          9
        ],
        "activityId": [
          44
        ],
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "type": [
          100
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ActivitySort": {},
      "ActivityType": {},
      "ActivityUnion": {
        "on_ListActivity": [
          49
        ],
        "on_MessageActivity": [
          93
        ],
        "on_TextActivity": [
          148
        ],
        "__typename": [
          139
        ]
      },
      "AiringNotification": {
        "animeId": [
          44
        ],
        "contexts": [
          139
        ],
        "createdAt": [
          44
        ],
        "episode": [
          44
        ],
        "id": [
          44
        ],
        "media": [
          53
        ],
        "type": [
          100
        ],
        "__typename": [
          139
        ]
      },
      "AiringProgression": {
        "episode": [
          36
        ],
        "score": [
          36
        ],
        "watching": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "AiringSchedule": {
        "airingAt": [
          44
        ],
        "episode": [
          44
        ],
        "id": [
          44
        ],
        "media": [
          53
        ],
        "mediaId": [
          44
        ],
        "timeUntilAiring": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "AiringScheduleConnection": {
        "edges": [
          14
        ],
        "nodes": [
          12
        ],
        "pageInfo": [
          103
        ],
        "__typename": [
          139
        ]
      },
      "AiringScheduleEdge": {
        "id": [
          44
        ],
        "node": [
          12
        ],
        "__typename": [
          139
        ]
      },
      "AiringScheduleInput": {
        "airingAt": [
          44
        ],
        "episode": [
          44
        ],
        "timeUntilAiring": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "AiringSort": {},
      "AniChartHighlightInput": {
        "highlight": [
          139
        ],
        "mediaId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "AniChartUser": {
        "highlights": [
          46
        ],
        "settings": [
          46
        ],
        "user": [
          159
        ],
        "__typename": [
          139
        ]
      },
      "Boolean": {},
      "Character": {
        "age": [
          139
        ],
        "bloodType": [
          139
        ],
        "dateOfBirth": [
          39
        ],
        "description": [
          139,
          {
            "asHtml": [
              19
            ]
          }
        ],
        "favourites": [
          44
        ],
        "gender": [
          139
        ],
        "id": [
          44
        ],
        "image": [
          23
        ],
        "isFavourite": [
          19
        ],
        "isFavouriteBlocked": [
          19
        ],
        "media": [
          55,
          {
            "onList": [
              19
            ],
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              76,
              "[MediaSort]"
            ],
            "type": [
              92
            ]
          }
        ],
        "modNotes": [
          139
        ],
        "name": [
          24
        ],
        "siteUrl": [
          139
        ],
        "updatedAt": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "CharacterConnection": {
        "edges": [
          22
        ],
        "nodes": [
          20
        ],
        "pageInfo": [
          103
        ],
        "__typename": [
          139
        ]
      },
      "CharacterEdge": {
        "favouriteOrder": [
          44
        ],
        "id": [
          44
        ],
        "media": [
          53
        ],
        "name": [
          139
        ],
        "node": [
          20
        ],
        "role": [
          26
        ],
        "voiceActorRoles": [
          134,
          {
            "language": [
              131
            ],
            "sort": [
              135,
              "[StaffSort]"
            ]
          }
        ],
        "voiceActors": [
          127,
          {
            "language": [
              131
            ],
            "sort": [
              135,
              "[StaffSort]"
            ]
          }
        ],
        "__typename": [
          139
        ]
      },
      "CharacterImage": {
        "large": [
          139
        ],
        "medium": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "CharacterName": {
        "alternative": [
          139
        ],
        "alternativeSpoiler": [
          139
        ],
        "first": [
          139
        ],
        "full": [
          139
        ],
        "last": [
          139
        ],
        "middle": [
          139
        ],
        "native": [
          139
        ],
        "userPreferred": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "CharacterNameInput": {
        "alternative": [
          139
        ],
        "alternativeSpoiler": [
          139
        ],
        "first": [
          139
        ],
        "last": [
          139
        ],
        "middle": [
          139
        ],
        "native": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "CharacterRole": {},
      "CharacterSort": {},
      "CharacterSubmission": {
        "assignee": [
          159
        ],
        "character": [
          20
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "locked": [
          19
        ],
        "notes": [
          139
        ],
        "source": [
          139
        ],
        "status": [
          146
        ],
        "submission": [
          20
        ],
        "submitter": [
          159
        ],
        "__typename": [
          139
        ]
      },
      "CharacterSubmissionConnection": {
        "edges": [
          30
        ],
        "nodes": [
          28
        ],
        "pageInfo": [
          103
        ],
        "__typename": [
          139
        ]
      },
      "CharacterSubmissionEdge": {
        "node": [
          28
        ],
        "role": [
          26
        ],
        "submittedVoiceActors": [
          137
        ],
        "voiceActors": [
          127
        ],
        "__typename": [
          139
        ]
      },
      "CountryCode": {},
      "Deleted": {
        "deleted": [
          19
        ],
        "__typename": [
          139
        ]
      },
      "ExternalLinkMediaType": {},
      "ExternalLinkType": {},
      "Favourites": {
        "anime": [
          55,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ]
          }
        ],
        "characters": [
          21,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ]
          }
        ],
        "manga": [
          55,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ]
          }
        ],
        "staff": [
          128,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ]
          }
        ],
        "studios": [
          141,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ]
          }
        ],
        "__typename": [
          139
        ]
      },
      "Float": {},
      "FollowingNotification": {
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "type": [
          100
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "FormatStats": {
        "amount": [
          44
        ],
        "format": [
          62
        ],
        "__typename": [
          139
        ]
      },
      "FuzzyDate": {
        "day": [
          44
        ],
        "month": [
          44
        ],
        "year": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "FuzzyDateInput": {
        "day": [
          44
        ],
        "month": [
          44
        ],
        "year": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "FuzzyDateInt": {},
      "GenreStats": {
        "amount": [
          44
        ],
        "genre": [
          139
        ],
        "meanScore": [
          44
        ],
        "timeWatched": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ID": {},
      "Int": {},
      "InternalPage": {
        "activities": [
          9,
          {
            "createdAt": [
              44
            ],
            "createdAt_greater": [
              44
            ],
            "createdAt_lesser": [
              44
            ],
            "hasReplies": [
              19
            ],
            "hasRepliesOrTypeText": [
              19
            ],
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "isFollowing": [
              19
            ],
            "mediaId": [
              44
            ],
            "mediaId_in": [
              44,
              "[Int]"
            ],
            "mediaId_not": [
              44
            ],
            "mediaId_not_in": [
              44,
              "[Int]"
            ],
            "messengerId": [
              44
            ],
            "messengerId_in": [
              44,
              "[Int]"
            ],
            "messengerId_not": [
              44
            ],
            "messengerId_not_in": [
              44,
              "[Int]"
            ],
            "sort": [
              7,
              "[ActivitySort]"
            ],
            "type": [
              8
            ],
            "type_in": [
              8,
              "[ActivityType]"
            ],
            "type_not": [
              8
            ],
            "type_not_in": [
              8,
              "[ActivityType]"
            ],
            "userId": [
              44
            ],
            "userId_in": [
              44,
              "[Int]"
            ],
            "userId_not": [
              44
            ],
            "userId_not_in": [
              44,
              "[Int]"
            ]
          }
        ],
        "activityReplies": [
          3,
          {
            "activityId": [
              44
            ],
            "id": [
              44
            ]
          }
        ],
        "airingSchedules": [
          12,
          {
            "airingAt": [
              44
            ],
            "airingAt_greater": [
              44
            ],
            "airingAt_lesser": [
              44
            ],
            "episode": [
              44
            ],
            "episode_greater": [
              44
            ],
            "episode_in": [
              44,
              "[Int]"
            ],
            "episode_lesser": [
              44
            ],
            "episode_not": [
              44
            ],
            "episode_not_in": [
              44,
              "[Int]"
            ],
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "mediaId": [
              44
            ],
            "mediaId_in": [
              44,
              "[Int]"
            ],
            "mediaId_not": [
              44
            ],
            "mediaId_not_in": [
              44,
              "[Int]"
            ],
            "notYetAired": [
              19
            ],
            "sort": [
              16,
              "[AiringSort]"
            ]
          }
        ],
        "characterSubmissions": [
          28,
          {
            "assigneeId": [
              44
            ],
            "characterId": [
              44
            ],
            "sort": [
              145,
              "[SubmissionSort]"
            ],
            "status": [
              146
            ],
            "userId": [
              44
            ]
          }
        ],
        "characters": [
          20,
          {
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "isBirthday": [
              19
            ],
            "search": [
              139
            ],
            "sort": [
              27,
              "[CharacterSort]"
            ]
          }
        ],
        "followers": [
          159,
          {
            "sort": [
              171,
              "[UserSort]"
            ],
            "userId": [
              44,
              "Int!"
            ]
          }
        ],
        "following": [
          159,
          {
            "sort": [
              171,
              "[UserSort]"
            ],
            "userId": [
              44,
              "Int!"
            ]
          }
        ],
        "likes": [
          159,
          {
            "likeableId": [
              44
            ],
            "type": [
              47
            ]
          }
        ],
        "media": [
          53,
          {
            "averageScore": [
              44
            ],
            "averageScore_greater": [
              44
            ],
            "averageScore_lesser": [
              44
            ],
            "averageScore_not": [
              44
            ],
            "chapters": [
              44
            ],
            "chapters_greater": [
              44
            ],
            "chapters_lesser": [
              44
            ],
            "countryOfOrigin": [
              31
            ],
            "duration": [
              44
            ],
            "duration_greater": [
              44
            ],
            "duration_lesser": [
              44
            ],
            "endDate": [
              41
            ],
            "endDate_greater": [
              41
            ],
            "endDate_lesser": [
              41
            ],
            "endDate_like": [
              139
            ],
            "episodes": [
              44
            ],
            "episodes_greater": [
              44
            ],
            "episodes_lesser": [
              44
            ],
            "format": [
              62
            ],
            "format_in": [
              62,
              "[MediaFormat]"
            ],
            "format_not": [
              62
            ],
            "format_not_in": [
              62,
              "[MediaFormat]"
            ],
            "genre": [
              139
            ],
            "genre_in": [
              139,
              "[String]"
            ],
            "genre_not_in": [
              139,
              "[String]"
            ],
            "id": [
              44
            ],
            "idMal": [
              44
            ],
            "idMal_in": [
              44,
              "[Int]"
            ],
            "idMal_not": [
              44
            ],
            "idMal_not_in": [
              44,
              "[Int]"
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "isAdult": [
              19
            ],
            "isLicensed": [
              19
            ],
            "licensedBy": [
              139
            ],
            "licensedById": [
              44
            ],
            "licensedById_in": [
              44,
              "[Int]"
            ],
            "licensedBy_in": [
              139,
              "[String]"
            ],
            "minimumTagRank": [
              44
            ],
            "onList": [
              19
            ],
            "popularity": [
              44
            ],
            "popularity_greater": [
              44
            ],
            "popularity_lesser": [
              44
            ],
            "popularity_not": [
              44
            ],
            "search": [
              139
            ],
            "season": [
              75
            ],
            "seasonYear": [
              44
            ],
            "sort": [
              76,
              "[MediaSort]"
            ],
            "source": [
              77
            ],
            "source_in": [
              77,
              "[MediaSource]"
            ],
            "startDate": [
              41
            ],
            "startDate_greater": [
              41
            ],
            "startDate_lesser": [
              41
            ],
            "startDate_like": [
              139
            ],
            "status": [
              79
            ],
            "status_in": [
              79,
              "[MediaStatus]"
            ],
            "status_not": [
              79
            ],
            "status_not_in": [
              79,
              "[MediaStatus]"
            ],
            "tag": [
              139
            ],
            "tagCategory": [
              139
            ],
            "tagCategory_in": [
              139,
              "[String]"
            ],
            "tagCategory_not_in": [
              139,
              "[String]"
            ],
            "tag_in": [
              139,
              "[String]"
            ],
            "tag_not_in": [
              139,
              "[String]"
            ],
            "type": [
              92
            ],
            "volumes": [
              44
            ],
            "volumes_greater": [
              44
            ],
            "volumes_lesser": [
              44
            ]
          }
        ],
        "mediaList": [
          63,
          {
            "compareWithAuthList": [
              19
            ],
            "completedAt": [
              41
            ],
            "completedAt_greater": [
              41
            ],
            "completedAt_lesser": [
              41
            ],
            "completedAt_like": [
              139
            ],
            "id": [
              44
            ],
            "isFollowing": [
              19
            ],
            "mediaId": [
              44
            ],
            "mediaId_in": [
              44,
              "[Int]"
            ],
            "mediaId_not_in": [
              44,
              "[Int]"
            ],
            "notes": [
              139
            ],
            "notes_like": [
              139
            ],
            "sort": [
              68,
              "[MediaListSort]"
            ],
            "startedAt": [
              41
            ],
            "startedAt_greater": [
              41
            ],
            "startedAt_lesser": [
              41
            ],
            "startedAt_like": [
              139
            ],
            "status": [
              69
            ],
            "status_in": [
              69,
              "[MediaListStatus]"
            ],
            "status_not": [
              69
            ],
            "status_not_in": [
              69,
              "[MediaListStatus]"
            ],
            "type": [
              92
            ],
            "userId": [
              44
            ],
            "userId_in": [
              44,
              "[Int]"
            ],
            "userName": [
              139
            ]
          }
        ],
        "mediaSubmissions": [
          81,
          {
            "assigneeId": [
              44
            ],
            "mediaId": [
              44
            ],
            "sort": [
              145,
              "[SubmissionSort]"
            ],
            "status": [
              146
            ],
            "submissionId": [
              44
            ],
            "type": [
              92
            ],
            "userId": [
              44
            ]
          }
        ],
        "mediaTrends": [
          88,
          {
            "averageScore": [
              44
            ],
            "averageScore_greater": [
              44
            ],
            "averageScore_lesser": [
              44
            ],
            "averageScore_not": [
              44
            ],
            "date": [
              44
            ],
            "date_greater": [
              44
            ],
            "date_lesser": [
              44
            ],
            "episode": [
              44
            ],
            "episode_greater": [
              44
            ],
            "episode_lesser": [
              44
            ],
            "episode_not": [
              44
            ],
            "mediaId": [
              44
            ],
            "mediaId_in": [
              44,
              "[Int]"
            ],
            "mediaId_not": [
              44
            ],
            "mediaId_not_in": [
              44,
              "[Int]"
            ],
            "popularity": [
              44
            ],
            "popularity_greater": [
              44
            ],
            "popularity_lesser": [
              44
            ],
            "popularity_not": [
              44
            ],
            "releasing": [
              19
            ],
            "sort": [
              91,
              "[MediaTrendSort]"
            ],
            "trending": [
              44
            ],
            "trending_greater": [
              44
            ],
            "trending_lesser": [
              44
            ],
            "trending_not": [
              44
            ]
          }
        ],
        "modActions": [
          94,
          {
            "modId": [
              44
            ],
            "userId": [
              44
            ]
          }
        ],
        "notifications": [
          101,
          {
            "resetNotificationCount": [
              19
            ],
            "type": [
              100
            ],
            "type_in": [
              100,
              "[NotificationType]"
            ]
          }
        ],
        "pageInfo": [
          103
        ],
        "recommendations": [
          106,
          {
            "id": [
              44
            ],
            "mediaId": [
              44
            ],
            "mediaRecommendationId": [
              44
            ],
            "onList": [
              19
            ],
            "rating": [
              44
            ],
            "rating_greater": [
              44
            ],
            "rating_lesser": [
              44
            ],
            "sort": [
              110,
              "[RecommendationSort]"
            ],
            "userId": [
              44
            ]
          }
        ],
        "reports": [
          112,
          {
            "reportedId": [
              44
            ],
            "reporterId": [
              44
            ]
          }
        ],
        "reviews": [
          113,
          {
            "id": [
              44
            ],
            "mediaId": [
              44
            ],
            "mediaType": [
              92
            ],
            "sort": [
              117,
              "[ReviewSort]"
            ],
            "userId": [
              44
            ]
          }
        ],
        "revisionHistory": [
          118,
          {
            "characterId": [
              44
            ],
            "mediaId": [
              44
            ],
            "staffId": [
              44
            ],
            "studioId": [
              44
            ],
            "userId": [
              44
            ]
          }
        ],
        "staff": [
          127,
          {
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "isBirthday": [
              19
            ],
            "search": [
              139
            ],
            "sort": [
              135,
              "[StaffSort]"
            ]
          }
        ],
        "staffSubmissions": [
          137,
          {
            "assigneeId": [
              44
            ],
            "sort": [
              145,
              "[SubmissionSort]"
            ],
            "staffId": [
              44
            ],
            "status": [
              146
            ],
            "userId": [
              44
            ]
          }
        ],
        "studios": [
          140,
          {
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "search": [
              139
            ],
            "sort": [
              143,
              "[StudioSort]"
            ]
          }
        ],
        "threadComments": [
          151,
          {
            "id": [
              44
            ],
            "sort": [
              155,
              "[ThreadCommentSort]"
            ],
            "threadId": [
              44
            ],
            "userId": [
              44
            ]
          }
        ],
        "threads": [
          149,
          {
            "categoryId": [
              44
            ],
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "mediaCategoryId": [
              44
            ],
            "replyUserId": [
              44
            ],
            "search": [
              139
            ],
            "sort": [
              158,
              "[ThreadSort]"
            ],
            "subscribed": [
              19
            ],
            "userId": [
              44
            ]
          }
        ],
        "userBlockSearch": [
          159,
          {
            "search": [
              139
            ]
          }
        ],
        "users": [
          159,
          {
            "id": [
              44
            ],
            "isModerator": [
              19
            ],
            "name": [
              139
            ],
            "search": [
              139
            ],
            "sort": [
              171,
              "[UserSort]"
            ]
          }
        ],
        "__typename": [
          139
        ]
      },
      "Json": {},
      "LikeableType": {},
      "LikeableUnion": {
        "on_ActivityReply": [
          3
        ],
        "on_ListActivity": [
          49
        ],
        "on_MessageActivity": [
          93
        ],
        "on_TextActivity": [
          148
        ],
        "on_Thread": [
          149
        ],
        "on_ThreadComment": [
          151
        ],
        "__typename": [
          139
        ]
      },
      "ListActivity": {
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "isLiked": [
          19
        ],
        "isLocked": [
          19
        ],
        "isPinned": [
          19
        ],
        "isSubscribed": [
          19
        ],
        "likeCount": [
          44
        ],
        "likes": [
          159
        ],
        "media": [
          53
        ],
        "progress": [
          139
        ],
        "replies": [
          3
        ],
        "replyCount": [
          44
        ],
        "siteUrl": [
          139
        ],
        "status": [
          139
        ],
        "type": [
          8
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ListActivityOption": {
        "disabled": [
          19
        ],
        "type": [
          69
        ],
        "__typename": [
          139
        ]
      },
      "ListActivityOptionInput": {
        "disabled": [
          19
        ],
        "type": [
          69
        ],
        "__typename": [
          139
        ]
      },
      "ListScoreStats": {
        "meanScore": [
          44
        ],
        "standardDeviation": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "Media": {
        "airingSchedule": [
          13,
          {
            "notYetAired": [
              19
            ],
            "page": [
              44
            ],
            "perPage": [
              44
            ]
          }
        ],
        "autoCreateForumThread": [
          19
        ],
        "averageScore": [
          44
        ],
        "bannerImage": [
          139
        ],
        "chapters": [
          44
        ],
        "characters": [
          21,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "role": [
              26
            ],
            "sort": [
              27,
              "[CharacterSort]"
            ]
          }
        ],
        "countryOfOrigin": [
          31
        ],
        "coverImage": [
          56
        ],
        "description": [
          139,
          {
            "asHtml": [
              19
            ]
          }
        ],
        "duration": [
          44
        ],
        "endDate": [
          39
        ],
        "episodes": [
          44
        ],
        "externalLinks": [
          60
        ],
        "favourites": [
          44
        ],
        "format": [
          62
        ],
        "genres": [
          139
        ],
        "hashtag": [
          139
        ],
        "id": [
          44
        ],
        "idMal": [
          44
        ],
        "isAdult": [
          19
        ],
        "isFavourite": [
          19
        ],
        "isFavouriteBlocked": [
          19
        ],
        "isLicensed": [
          19
        ],
        "isLocked": [
          19
        ],
        "isRecommendationBlocked": [
          19
        ],
        "isReviewBlocked": [
          19
        ],
        "meanScore": [
          44
        ],
        "mediaListEntry": [
          63
        ],
        "modNotes": [
          139
        ],
        "nextAiringEpisode": [
          12
        ],
        "popularity": [
          44
        ],
        "rankings": [
          72
        ],
        "recommendations": [
          107,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              110,
              "[RecommendationSort]"
            ]
          }
        ],
        "relations": [
          55
        ],
        "reviews": [
          114,
          {
            "limit": [
              44
            ],
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              117,
              "[ReviewSort]"
            ]
          }
        ],
        "season": [
          75
        ],
        "seasonInt": [
          44
        ],
        "seasonYear": [
          44
        ],
        "siteUrl": [
          139
        ],
        "source": [
          77,
          {
            "version": [
              44
            ]
          }
        ],
        "staff": [
          128,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              135,
              "[StaffSort]"
            ]
          }
        ],
        "startDate": [
          39
        ],
        "stats": [
          78
        ],
        "status": [
          79,
          {
            "version": [
              44
            ]
          }
        ],
        "streamingEpisodes": [
          80
        ],
        "studios": [
          141,
          {
            "isMain": [
              19
            ],
            "sort": [
              143,
              "[StudioSort]"
            ]
          }
        ],
        "synonyms": [
          139
        ],
        "tags": [
          84
        ],
        "title": [
          85
        ],
        "trailer": [
          87
        ],
        "trending": [
          44
        ],
        "trends": [
          89,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "releasing": [
              19
            ],
            "sort": [
              91,
              "[MediaTrendSort]"
            ]
          }
        ],
        "type": [
          92
        ],
        "updatedAt": [
          44
        ],
        "volumes": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "MediaCharacter": {
        "character": [
          20
        ],
        "characterName": [
          139
        ],
        "dubGroup": [
          139
        ],
        "id": [
          44
        ],
        "role": [
          26
        ],
        "roleNotes": [
          139
        ],
        "voiceActor": [
          127
        ],
        "__typename": [
          139
        ]
      },
      "MediaConnection": {
        "edges": [
          59
        ],
        "nodes": [
          53
        ],
        "pageInfo": [
          103
        ],
        "__typename": [
          139
        ]
      },
      "MediaCoverImage": {
        "color": [
          139
        ],
        "extraLarge": [
          139
        ],
        "large": [
          139
        ],
        "medium": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "MediaDataChangeNotification": {
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "media": [
          53
        ],
        "mediaId": [
          44
        ],
        "reason": [
          139
        ],
        "type": [
          100
        ],
        "__typename": [
          139
        ]
      },
      "MediaDeletionNotification": {
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "deletedMediaTitle": [
          139
        ],
        "id": [
          44
        ],
        "reason": [
          139
        ],
        "type": [
          100
        ],
        "__typename": [
          139
        ]
      },
      "MediaEdge": {
        "characterName": [
          139
        ],
        "characterRole": [
          26
        ],
        "characters": [
          20
        ],
        "dubGroup": [
          139
        ],
        "favouriteOrder": [
          44
        ],
        "id": [
          44
        ],
        "isMainStudio": [
          19
        ],
        "node": [
          53
        ],
        "relationType": [
          74,
          {
            "version": [
              44
            ]
          }
        ],
        "roleNotes": [
          139
        ],
        "staffRole": [
          139
        ],
        "voiceActorRoles": [
          134,
          {
            "language": [
              131
            ],
            "sort": [
              135,
              "[StaffSort]"
            ]
          }
        ],
        "voiceActors": [
          127,
          {
            "language": [
              131
            ],
            "sort": [
              135,
              "[StaffSort]"
            ]
          }
        ],
        "__typename": [
          139
        ]
      },
      "MediaExternalLink": {
        "color": [
          139
        ],
        "icon": [
          139
        ],
        "id": [
          44
        ],
        "isDisabled": [
          19
        ],
        "language": [
          139
        ],
        "notes": [
          139
        ],
        "site": [
          139
        ],
        "siteId": [
          44
        ],
        "type": [
          34
        ],
        "url": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "MediaExternalLinkInput": {
        "id": [
          44
        ],
        "site": [
          139
        ],
        "url": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "MediaFormat": {},
      "MediaList": {
        "advancedScores": [
          46
        ],
        "completedAt": [
          39
        ],
        "createdAt": [
          44
        ],
        "customLists": [
          46,
          {
            "asArray": [
              19
            ]
          }
        ],
        "hiddenFromStatusLists": [
          19
        ],
        "id": [
          44
        ],
        "media": [
          53
        ],
        "mediaId": [
          44
        ],
        "notes": [
          139
        ],
        "priority": [
          44
        ],
        "private": [
          19
        ],
        "progress": [
          44
        ],
        "progressVolumes": [
          44
        ],
        "repeat": [
          44
        ],
        "score": [
          36,
          {
            "format": [
              121
            ]
          }
        ],
        "startedAt": [
          39
        ],
        "status": [
          69
        ],
        "updatedAt": [
          44
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "MediaListCollection": {
        "customLists": [
          63,
          {
            "asArray": [
              19
            ]
          }
        ],
        "hasNextChunk": [
          19
        ],
        "lists": [
          65
        ],
        "statusLists": [
          63,
          {
            "asArray": [
              19
            ]
          }
        ],
        "user": [
          159
        ],
        "__typename": [
          139
        ]
      },
      "MediaListGroup": {
        "entries": [
          63
        ],
        "isCustomList": [
          19
        ],
        "isSplitCompletedList": [
          19
        ],
        "name": [
          139
        ],
        "status": [
          69
        ],
        "__typename": [
          139
        ]
      },
      "MediaListOptions": {
        "animeList": [
          70
        ],
        "mangaList": [
          70
        ],
        "rowOrder": [
          139
        ],
        "scoreFormat": [
          121
        ],
        "sharedTheme": [
          46
        ],
        "sharedThemeEnabled": [
          19
        ],
        "useLegacyLists": [
          19
        ],
        "__typename": [
          139
        ]
      },
      "MediaListOptionsInput": {
        "advancedScoring": [
          139
        ],
        "advancedScoringEnabled": [
          19
        ],
        "customLists": [
          139
        ],
        "sectionOrder": [
          139
        ],
        "splitCompletedSectionByFormat": [
          19
        ],
        "theme": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "MediaListSort": {},
      "MediaListStatus": {},
      "MediaListTypeOptions": {
        "advancedScoring": [
          139
        ],
        "advancedScoringEnabled": [
          19
        ],
        "customLists": [
          139
        ],
        "sectionOrder": [
          139
        ],
        "splitCompletedSectionByFormat": [
          19
        ],
        "theme": [
          46
        ],
        "__typename": [
          139
        ]
      },
      "MediaMergeNotification": {
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "deletedMediaTitles": [
          139
        ],
        "id": [
          44
        ],
        "media": [
          53
        ],
        "mediaId": [
          44
        ],
        "reason": [
          139
        ],
        "type": [
          100
        ],
        "__typename": [
          139
        ]
      },
      "MediaRank": {
        "allTime": [
          19
        ],
        "context": [
          139
        ],
        "format": [
          62
        ],
        "id": [
          44
        ],
        "rank": [
          44
        ],
        "season": [
          75
        ],
        "type": [
          73
        ],
        "year": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "MediaRankType": {},
      "MediaRelation": {},
      "MediaSeason": {},
      "MediaSort": {},
      "MediaSource": {},
      "MediaStats": {
        "airingProgression": [
          11
        ],
        "scoreDistribution": [
          120
        ],
        "statusDistribution": [
          138
        ],
        "__typename": [
          139
        ]
      },
      "MediaStatus": {},
      "MediaStreamingEpisode": {
        "site": [
          139
        ],
        "thumbnail": [
          139
        ],
        "title": [
          139
        ],
        "url": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "MediaSubmission": {
        "assignee": [
          159
        ],
        "changes": [
          139
        ],
        "characters": [
          82
        ],
        "createdAt": [
          44
        ],
        "externalLinks": [
          82
        ],
        "id": [
          44
        ],
        "locked": [
          19
        ],
        "media": [
          53
        ],
        "notes": [
          139
        ],
        "relations": [
          59
        ],
        "source": [
          139
        ],
        "staff": [
          82
        ],
        "status": [
          146
        ],
        "studios": [
          82
        ],
        "submission": [
          53
        ],
        "submitter": [
          159
        ],
        "submitterStats": [
          46
        ],
        "__typename": [
          139
        ]
      },
      "MediaSubmissionComparison": {
        "character": [
          54
        ],
        "externalLink": [
          60
        ],
        "staff": [
          129
        ],
        "studio": [
          142
        ],
        "submission": [
          83
        ],
        "__typename": [
          139
        ]
      },
      "MediaSubmissionEdge": {
        "character": [
          20
        ],
        "characterName": [
          139
        ],
        "characterRole": [
          26
        ],
        "characterSubmission": [
          20
        ],
        "dubGroup": [
          139
        ],
        "externalLink": [
          60
        ],
        "id": [
          44
        ],
        "isMain": [
          19
        ],
        "media": [
          53
        ],
        "roleNotes": [
          139
        ],
        "staff": [
          127
        ],
        "staffRole": [
          139
        ],
        "staffSubmission": [
          127
        ],
        "studio": [
          140
        ],
        "voiceActor": [
          127
        ],
        "voiceActorSubmission": [
          127
        ],
        "__typename": [
          139
        ]
      },
      "MediaTag": {
        "category": [
          139
        ],
        "description": [
          139
        ],
        "id": [
          44
        ],
        "isAdult": [
          19
        ],
        "isGeneralSpoiler": [
          19
        ],
        "isMediaSpoiler": [
          19
        ],
        "name": [
          139
        ],
        "rank": [
          44
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "MediaTitle": {
        "english": [
          139,
          {
            "stylised": [
              19
            ]
          }
        ],
        "native": [
          139,
          {
            "stylised": [
              19
            ]
          }
        ],
        "romaji": [
          139,
          {
            "stylised": [
              19
            ]
          }
        ],
        "userPreferred": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "MediaTitleInput": {
        "english": [
          139
        ],
        "native": [
          139
        ],
        "romaji": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "MediaTrailer": {
        "id": [
          139
        ],
        "site": [
          139
        ],
        "thumbnail": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "MediaTrend": {
        "averageScore": [
          44
        ],
        "date": [
          44
        ],
        "episode": [
          44
        ],
        "inProgress": [
          44
        ],
        "media": [
          53
        ],
        "mediaId": [
          44
        ],
        "popularity": [
          44
        ],
        "releasing": [
          19
        ],
        "trending": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "MediaTrendConnection": {
        "edges": [
          90
        ],
        "nodes": [
          88
        ],
        "pageInfo": [
          103
        ],
        "__typename": [
          139
        ]
      },
      "MediaTrendEdge": {
        "node": [
          88
        ],
        "__typename": [
          139
        ]
      },
      "MediaTrendSort": {},
      "MediaType": {},
      "MessageActivity": {
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "isLiked": [
          19
        ],
        "isLocked": [
          19
        ],
        "isPrivate": [
          19
        ],
        "isSubscribed": [
          19
        ],
        "likeCount": [
          44
        ],
        "likes": [
          159
        ],
        "message": [
          139,
          {
            "asHtml": [
              19
            ]
          }
        ],
        "messenger": [
          159
        ],
        "messengerId": [
          44
        ],
        "recipient": [
          159
        ],
        "recipientId": [
          44
        ],
        "replies": [
          3
        ],
        "replyCount": [
          44
        ],
        "siteUrl": [
          139
        ],
        "type": [
          8
        ],
        "__typename": [
          139
        ]
      },
      "ModAction": {
        "createdAt": [
          44
        ],
        "data": [
          139
        ],
        "id": [
          44
        ],
        "mod": [
          159
        ],
        "objectId": [
          44
        ],
        "objectType": [
          139
        ],
        "type": [
          95
        ],
        "user": [
          159
        ],
        "__typename": [
          139
        ]
      },
      "ModActionType": {},
      "ModRole": {},
      "Mutation": {
        "DeleteActivity": [
          32,
          {
            "id": [
              44
            ]
          }
        ],
        "DeleteActivityReply": [
          32,
          {
            "id": [
              44
            ]
          }
        ],
        "DeleteCustomList": [
          32,
          {
            "customList": [
              139
            ],
            "type": [
              92
            ]
          }
        ],
        "DeleteMediaListEntry": [
          32,
          {
            "id": [
              44
            ]
          }
        ],
        "DeleteReview": [
          32,
          {
            "id": [
              44
            ]
          }
        ],
        "DeleteThread": [
          32,
          {
            "id": [
              44
            ]
          }
        ],
        "DeleteThreadComment": [
          32,
          {
            "id": [
              44
            ]
          }
        ],
        "RateReview": [
          113,
          {
            "rating": [
              116
            ],
            "reviewId": [
              44
            ]
          }
        ],
        "SaveActivityReply": [
          3,
          {
            "activityId": [
              44
            ],
            "asMod": [
              19
            ],
            "id": [
              44
            ],
            "text": [
              139
            ]
          }
        ],
        "SaveListActivity": [
          49,
          {
            "id": [
              44
            ],
            "locked": [
              19
            ]
          }
        ],
        "SaveMediaListEntry": [
          63,
          {
            "advancedScores": [
              36,
              "[Float]"
            ],
            "completedAt": [
              40
            ],
            "customLists": [
              139,
              "[String]"
            ],
            "hiddenFromStatusLists": [
              19
            ],
            "id": [
              44
            ],
            "mediaId": [
              44
            ],
            "notes": [
              139
            ],
            "priority": [
              44
            ],
            "private": [
              19
            ],
            "progress": [
              44
            ],
            "progressVolumes": [
              44
            ],
            "repeat": [
              44
            ],
            "score": [
              36
            ],
            "scoreRaw": [
              44
            ],
            "startedAt": [
              40
            ],
            "status": [
              69
            ]
          }
        ],
        "SaveMessageActivity": [
          93,
          {
            "asMod": [
              19
            ],
            "id": [
              44
            ],
            "locked": [
              19
            ],
            "message": [
              139
            ],
            "private": [
              19
            ],
            "recipientId": [
              44
            ]
          }
        ],
        "SaveRecommendation": [
          106,
          {
            "mediaId": [
              44
            ],
            "mediaRecommendationId": [
              44
            ],
            "rating": [
              109
            ]
          }
        ],
        "SaveReview": [
          113,
          {
            "body": [
              139
            ],
            "id": [
              44
            ],
            "mediaId": [
              44
            ],
            "private": [
              19
            ],
            "score": [
              44
            ],
            "summary": [
              139
            ]
          }
        ],
        "SaveTextActivity": [
          148,
          {
            "id": [
              44
            ],
            "locked": [
              19
            ],
            "text": [
              139
            ]
          }
        ],
        "SaveThread": [
          149,
          {
            "body": [
              139
            ],
            "categories": [
              44,
              "[Int]"
            ],
            "id": [
              44
            ],
            "locked": [
              19
            ],
            "mediaCategories": [
              44,
              "[Int]"
            ],
            "sticky": [
              19
            ],
            "title": [
              139
            ]
          }
        ],
        "SaveThreadComment": [
          151,
          {
            "comment": [
              139
            ],
            "id": [
              44
            ],
            "locked": [
              19
            ],
            "parentCommentId": [
              44
            ],
            "threadId": [
              44
            ]
          }
        ],
        "ToggleActivityPin": [
          9,
          {
            "id": [
              44
            ],
            "pinned": [
              19
            ]
          }
        ],
        "ToggleActivitySubscription": [
          9,
          {
            "activityId": [
              44
            ],
            "subscribe": [
              19
            ]
          }
        ],
        "ToggleFavourite": [
          35,
          {
            "animeId": [
              44
            ],
            "characterId": [
              44
            ],
            "mangaId": [
              44
            ],
            "staffId": [
              44
            ],
            "studioId": [
              44
            ]
          }
        ],
        "ToggleFollow": [
          159,
          {
            "userId": [
              44
            ]
          }
        ],
        "ToggleLike": [
          159,
          {
            "id": [
              44
            ],
            "type": [
              47
            ]
          }
        ],
        "ToggleLikeV2": [
          48,
          {
            "id": [
              44
            ],
            "type": [
              47
            ]
          }
        ],
        "ToggleThreadSubscription": [
          149,
          {
            "subscribe": [
              19
            ],
            "threadId": [
              44
            ]
          }
        ],
        "UpdateAniChartHighlights": [
          46,
          {
            "highlights": [
              17,
              "[AniChartHighlightInput]"
            ]
          }
        ],
        "UpdateAniChartSettings": [
          46,
          {
            "outgoingLinkProvider": [
              139
            ],
            "sort": [
              139
            ],
            "theme": [
              139
            ],
            "titleLanguage": [
              139
            ]
          }
        ],
        "UpdateFavouriteOrder": [
          35,
          {
            "animeIds": [
              44,
              "[Int]"
            ],
            "animeOrder": [
              44,
              "[Int]"
            ],
            "characterIds": [
              44,
              "[Int]"
            ],
            "characterOrder": [
              44,
              "[Int]"
            ],
            "mangaIds": [
              44,
              "[Int]"
            ],
            "mangaOrder": [
              44,
              "[Int]"
            ],
            "staffIds": [
              44,
              "[Int]"
            ],
            "staffOrder": [
              44,
              "[Int]"
            ],
            "studioIds": [
              44,
              "[Int]"
            ],
            "studioOrder": [
              44,
              "[Int]"
            ]
          }
        ],
        "UpdateMediaListEntries": [
          63,
          {
            "advancedScores": [
              36,
              "[Float]"
            ],
            "completedAt": [
              40
            ],
            "hiddenFromStatusLists": [
              19
            ],
            "ids": [
              44,
              "[Int]"
            ],
            "notes": [
              139
            ],
            "priority": [
              44
            ],
            "private": [
              19
            ],
            "progress": [
              44
            ],
            "progressVolumes": [
              44
            ],
            "repeat": [
              44
            ],
            "score": [
              36
            ],
            "scoreRaw": [
              44
            ],
            "startedAt": [
              40
            ],
            "status": [
              69
            ]
          }
        ],
        "UpdateUser": [
          159,
          {
            "about": [
              139
            ],
            "activityMergeTime": [
              44
            ],
            "airingNotifications": [
              19
            ],
            "animeListOptions": [
              67
            ],
            "disabledListActivity": [
              51,
              "[ListActivityOptionInput]"
            ],
            "displayAdultContent": [
              19
            ],
            "donatorBadge": [
              139
            ],
            "mangaListOptions": [
              67
            ],
            "notificationOptions": [
              99,
              "[NotificationOptionInput]"
            ],
            "profileColor": [
              139
            ],
            "restrictMessagesToFollowing": [
              19
            ],
            "rowOrder": [
              139
            ],
            "scoreFormat": [
              121
            ],
            "staffNameLanguage": [
              172
            ],
            "timezone": [
              139
            ],
            "titleLanguage": [
              182
            ]
          }
        ],
        "__typename": [
          139
        ]
      },
      "NotificationOption": {
        "enabled": [
          19
        ],
        "type": [
          100
        ],
        "__typename": [
          139
        ]
      },
      "NotificationOptionInput": {
        "enabled": [
          19
        ],
        "type": [
          100
        ],
        "__typename": [
          139
        ]
      },
      "NotificationType": {},
      "NotificationUnion": {
        "on_ActivityLikeNotification": [
          0
        ],
        "on_ActivityMentionNotification": [
          1
        ],
        "on_ActivityMessageNotification": [
          2
        ],
        "on_ActivityReplyLikeNotification": [
          4
        ],
        "on_ActivityReplyNotification": [
          5
        ],
        "on_ActivityReplySubscribedNotification": [
          6
        ],
        "on_AiringNotification": [
          10
        ],
        "on_FollowingNotification": [
          37
        ],
        "on_MediaDataChangeNotification": [
          57
        ],
        "on_MediaDeletionNotification": [
          58
        ],
        "on_MediaMergeNotification": [
          71
        ],
        "on_RelatedMediaAdditionNotification": [
          111
        ],
        "on_ThreadCommentLikeNotification": [
          152
        ],
        "on_ThreadCommentMentionNotification": [
          153
        ],
        "on_ThreadCommentReplyNotification": [
          154
        ],
        "on_ThreadCommentSubscribedNotification": [
          156
        ],
        "on_ThreadLikeNotification": [
          157
        ],
        "__typename": [
          139
        ]
      },
      "Page": {
        "activities": [
          9,
          {
            "createdAt": [
              44
            ],
            "createdAt_greater": [
              44
            ],
            "createdAt_lesser": [
              44
            ],
            "hasReplies": [
              19
            ],
            "hasRepliesOrTypeText": [
              19
            ],
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "isFollowing": [
              19
            ],
            "mediaId": [
              44
            ],
            "mediaId_in": [
              44,
              "[Int]"
            ],
            "mediaId_not": [
              44
            ],
            "mediaId_not_in": [
              44,
              "[Int]"
            ],
            "messengerId": [
              44
            ],
            "messengerId_in": [
              44,
              "[Int]"
            ],
            "messengerId_not": [
              44
            ],
            "messengerId_not_in": [
              44,
              "[Int]"
            ],
            "sort": [
              7,
              "[ActivitySort]"
            ],
            "type": [
              8
            ],
            "type_in": [
              8,
              "[ActivityType]"
            ],
            "type_not": [
              8
            ],
            "type_not_in": [
              8,
              "[ActivityType]"
            ],
            "userId": [
              44
            ],
            "userId_in": [
              44,
              "[Int]"
            ],
            "userId_not": [
              44
            ],
            "userId_not_in": [
              44,
              "[Int]"
            ]
          }
        ],
        "activityReplies": [
          3,
          {
            "activityId": [
              44
            ],
            "id": [
              44
            ]
          }
        ],
        "airingSchedules": [
          12,
          {
            "airingAt": [
              44
            ],
            "airingAt_greater": [
              44
            ],
            "airingAt_lesser": [
              44
            ],
            "episode": [
              44
            ],
            "episode_greater": [
              44
            ],
            "episode_in": [
              44,
              "[Int]"
            ],
            "episode_lesser": [
              44
            ],
            "episode_not": [
              44
            ],
            "episode_not_in": [
              44,
              "[Int]"
            ],
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "mediaId": [
              44
            ],
            "mediaId_in": [
              44,
              "[Int]"
            ],
            "mediaId_not": [
              44
            ],
            "mediaId_not_in": [
              44,
              "[Int]"
            ],
            "notYetAired": [
              19
            ],
            "sort": [
              16,
              "[AiringSort]"
            ]
          }
        ],
        "characters": [
          20,
          {
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "isBirthday": [
              19
            ],
            "search": [
              139
            ],
            "sort": [
              27,
              "[CharacterSort]"
            ]
          }
        ],
        "followers": [
          159,
          {
            "sort": [
              171,
              "[UserSort]"
            ],
            "userId": [
              44,
              "Int!"
            ]
          }
        ],
        "following": [
          159,
          {
            "sort": [
              171,
              "[UserSort]"
            ],
            "userId": [
              44,
              "Int!"
            ]
          }
        ],
        "likes": [
          159,
          {
            "likeableId": [
              44
            ],
            "type": [
              47
            ]
          }
        ],
        "media": [
          53,
          {
            "averageScore": [
              44
            ],
            "averageScore_greater": [
              44
            ],
            "averageScore_lesser": [
              44
            ],
            "averageScore_not": [
              44
            ],
            "chapters": [
              44
            ],
            "chapters_greater": [
              44
            ],
            "chapters_lesser": [
              44
            ],
            "countryOfOrigin": [
              31
            ],
            "duration": [
              44
            ],
            "duration_greater": [
              44
            ],
            "duration_lesser": [
              44
            ],
            "endDate": [
              41
            ],
            "endDate_greater": [
              41
            ],
            "endDate_lesser": [
              41
            ],
            "endDate_like": [
              139
            ],
            "episodes": [
              44
            ],
            "episodes_greater": [
              44
            ],
            "episodes_lesser": [
              44
            ],
            "format": [
              62
            ],
            "format_in": [
              62,
              "[MediaFormat]"
            ],
            "format_not": [
              62
            ],
            "format_not_in": [
              62,
              "[MediaFormat]"
            ],
            "genre": [
              139
            ],
            "genre_in": [
              139,
              "[String]"
            ],
            "genre_not_in": [
              139,
              "[String]"
            ],
            "id": [
              44
            ],
            "idMal": [
              44
            ],
            "idMal_in": [
              44,
              "[Int]"
            ],
            "idMal_not": [
              44
            ],
            "idMal_not_in": [
              44,
              "[Int]"
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "isAdult": [
              19
            ],
            "isLicensed": [
              19
            ],
            "licensedBy": [
              139
            ],
            "licensedById": [
              44
            ],
            "licensedById_in": [
              44,
              "[Int]"
            ],
            "licensedBy_in": [
              139,
              "[String]"
            ],
            "minimumTagRank": [
              44
            ],
            "onList": [
              19
            ],
            "popularity": [
              44
            ],
            "popularity_greater": [
              44
            ],
            "popularity_lesser": [
              44
            ],
            "popularity_not": [
              44
            ],
            "search": [
              139
            ],
            "season": [
              75
            ],
            "seasonYear": [
              44
            ],
            "sort": [
              76,
              "[MediaSort]"
            ],
            "source": [
              77
            ],
            "source_in": [
              77,
              "[MediaSource]"
            ],
            "startDate": [
              41
            ],
            "startDate_greater": [
              41
            ],
            "startDate_lesser": [
              41
            ],
            "startDate_like": [
              139
            ],
            "status": [
              79
            ],
            "status_in": [
              79,
              "[MediaStatus]"
            ],
            "status_not": [
              79
            ],
            "status_not_in": [
              79,
              "[MediaStatus]"
            ],
            "tag": [
              139
            ],
            "tagCategory": [
              139
            ],
            "tagCategory_in": [
              139,
              "[String]"
            ],
            "tagCategory_not_in": [
              139,
              "[String]"
            ],
            "tag_in": [
              139,
              "[String]"
            ],
            "tag_not_in": [
              139,
              "[String]"
            ],
            "type": [
              92
            ],
            "volumes": [
              44
            ],
            "volumes_greater": [
              44
            ],
            "volumes_lesser": [
              44
            ]
          }
        ],
        "mediaList": [
          63,
          {
            "compareWithAuthList": [
              19
            ],
            "completedAt": [
              41
            ],
            "completedAt_greater": [
              41
            ],
            "completedAt_lesser": [
              41
            ],
            "completedAt_like": [
              139
            ],
            "id": [
              44
            ],
            "isFollowing": [
              19
            ],
            "mediaId": [
              44
            ],
            "mediaId_in": [
              44,
              "[Int]"
            ],
            "mediaId_not_in": [
              44,
              "[Int]"
            ],
            "notes": [
              139
            ],
            "notes_like": [
              139
            ],
            "sort": [
              68,
              "[MediaListSort]"
            ],
            "startedAt": [
              41
            ],
            "startedAt_greater": [
              41
            ],
            "startedAt_lesser": [
              41
            ],
            "startedAt_like": [
              139
            ],
            "status": [
              69
            ],
            "status_in": [
              69,
              "[MediaListStatus]"
            ],
            "status_not": [
              69
            ],
            "status_not_in": [
              69,
              "[MediaListStatus]"
            ],
            "type": [
              92
            ],
            "userId": [
              44
            ],
            "userId_in": [
              44,
              "[Int]"
            ],
            "userName": [
              139
            ]
          }
        ],
        "mediaTrends": [
          88,
          {
            "averageScore": [
              44
            ],
            "averageScore_greater": [
              44
            ],
            "averageScore_lesser": [
              44
            ],
            "averageScore_not": [
              44
            ],
            "date": [
              44
            ],
            "date_greater": [
              44
            ],
            "date_lesser": [
              44
            ],
            "episode": [
              44
            ],
            "episode_greater": [
              44
            ],
            "episode_lesser": [
              44
            ],
            "episode_not": [
              44
            ],
            "mediaId": [
              44
            ],
            "mediaId_in": [
              44,
              "[Int]"
            ],
            "mediaId_not": [
              44
            ],
            "mediaId_not_in": [
              44,
              "[Int]"
            ],
            "popularity": [
              44
            ],
            "popularity_greater": [
              44
            ],
            "popularity_lesser": [
              44
            ],
            "popularity_not": [
              44
            ],
            "releasing": [
              19
            ],
            "sort": [
              91,
              "[MediaTrendSort]"
            ],
            "trending": [
              44
            ],
            "trending_greater": [
              44
            ],
            "trending_lesser": [
              44
            ],
            "trending_not": [
              44
            ]
          }
        ],
        "notifications": [
          101,
          {
            "resetNotificationCount": [
              19
            ],
            "type": [
              100
            ],
            "type_in": [
              100,
              "[NotificationType]"
            ]
          }
        ],
        "pageInfo": [
          103
        ],
        "recommendations": [
          106,
          {
            "id": [
              44
            ],
            "mediaId": [
              44
            ],
            "mediaRecommendationId": [
              44
            ],
            "onList": [
              19
            ],
            "rating": [
              44
            ],
            "rating_greater": [
              44
            ],
            "rating_lesser": [
              44
            ],
            "sort": [
              110,
              "[RecommendationSort]"
            ],
            "userId": [
              44
            ]
          }
        ],
        "reviews": [
          113,
          {
            "id": [
              44
            ],
            "mediaId": [
              44
            ],
            "mediaType": [
              92
            ],
            "sort": [
              117,
              "[ReviewSort]"
            ],
            "userId": [
              44
            ]
          }
        ],
        "staff": [
          127,
          {
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "isBirthday": [
              19
            ],
            "search": [
              139
            ],
            "sort": [
              135,
              "[StaffSort]"
            ]
          }
        ],
        "studios": [
          140,
          {
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "search": [
              139
            ],
            "sort": [
              143,
              "[StudioSort]"
            ]
          }
        ],
        "threadComments": [
          151,
          {
            "id": [
              44
            ],
            "sort": [
              155,
              "[ThreadCommentSort]"
            ],
            "threadId": [
              44
            ],
            "userId": [
              44
            ]
          }
        ],
        "threads": [
          149,
          {
            "categoryId": [
              44
            ],
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "mediaCategoryId": [
              44
            ],
            "replyUserId": [
              44
            ],
            "search": [
              139
            ],
            "sort": [
              158,
              "[ThreadSort]"
            ],
            "subscribed": [
              19
            ],
            "userId": [
              44
            ]
          }
        ],
        "users": [
          159,
          {
            "id": [
              44
            ],
            "isModerator": [
              19
            ],
            "name": [
              139
            ],
            "search": [
              139
            ],
            "sort": [
              171,
              "[UserSort]"
            ]
          }
        ],
        "__typename": [
          139
        ]
      },
      "PageInfo": {
        "currentPage": [
          44
        ],
        "hasNextPage": [
          19
        ],
        "lastPage": [
          44
        ],
        "perPage": [
          44
        ],
        "total": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ParsedMarkdown": {
        "html": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "Query": {
        "Activity": [
          9,
          {
            "createdAt": [
              44
            ],
            "createdAt_greater": [
              44
            ],
            "createdAt_lesser": [
              44
            ],
            "hasReplies": [
              19
            ],
            "hasRepliesOrTypeText": [
              19
            ],
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "isFollowing": [
              19
            ],
            "mediaId": [
              44
            ],
            "mediaId_in": [
              44,
              "[Int]"
            ],
            "mediaId_not": [
              44
            ],
            "mediaId_not_in": [
              44,
              "[Int]"
            ],
            "messengerId": [
              44
            ],
            "messengerId_in": [
              44,
              "[Int]"
            ],
            "messengerId_not": [
              44
            ],
            "messengerId_not_in": [
              44,
              "[Int]"
            ],
            "sort": [
              7,
              "[ActivitySort]"
            ],
            "type": [
              8
            ],
            "type_in": [
              8,
              "[ActivityType]"
            ],
            "type_not": [
              8
            ],
            "type_not_in": [
              8,
              "[ActivityType]"
            ],
            "userId": [
              44
            ],
            "userId_in": [
              44,
              "[Int]"
            ],
            "userId_not": [
              44
            ],
            "userId_not_in": [
              44,
              "[Int]"
            ]
          }
        ],
        "ActivityReply": [
          3,
          {
            "activityId": [
              44
            ],
            "id": [
              44
            ]
          }
        ],
        "AiringSchedule": [
          12,
          {
            "airingAt": [
              44
            ],
            "airingAt_greater": [
              44
            ],
            "airingAt_lesser": [
              44
            ],
            "episode": [
              44
            ],
            "episode_greater": [
              44
            ],
            "episode_in": [
              44,
              "[Int]"
            ],
            "episode_lesser": [
              44
            ],
            "episode_not": [
              44
            ],
            "episode_not_in": [
              44,
              "[Int]"
            ],
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "mediaId": [
              44
            ],
            "mediaId_in": [
              44,
              "[Int]"
            ],
            "mediaId_not": [
              44
            ],
            "mediaId_not_in": [
              44,
              "[Int]"
            ],
            "notYetAired": [
              19
            ],
            "sort": [
              16,
              "[AiringSort]"
            ]
          }
        ],
        "AniChartUser": [
          18
        ],
        "Character": [
          20,
          {
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "isBirthday": [
              19
            ],
            "search": [
              139
            ],
            "sort": [
              27,
              "[CharacterSort]"
            ]
          }
        ],
        "ExternalLinkSourceCollection": [
          60,
          {
            "id": [
              44
            ],
            "mediaType": [
              33
            ],
            "type": [
              34
            ]
          }
        ],
        "Follower": [
          159,
          {
            "sort": [
              171,
              "[UserSort]"
            ],
            "userId": [
              44,
              "Int!"
            ]
          }
        ],
        "Following": [
          159,
          {
            "sort": [
              171,
              "[UserSort]"
            ],
            "userId": [
              44,
              "Int!"
            ]
          }
        ],
        "GenreCollection": [
          139
        ],
        "Like": [
          159,
          {
            "likeableId": [
              44
            ],
            "type": [
              47
            ]
          }
        ],
        "Markdown": [
          104,
          {
            "markdown": [
              139,
              "String!"
            ]
          }
        ],
        "Media": [
          53,
          {
            "averageScore": [
              44
            ],
            "averageScore_greater": [
              44
            ],
            "averageScore_lesser": [
              44
            ],
            "averageScore_not": [
              44
            ],
            "chapters": [
              44
            ],
            "chapters_greater": [
              44
            ],
            "chapters_lesser": [
              44
            ],
            "countryOfOrigin": [
              31
            ],
            "duration": [
              44
            ],
            "duration_greater": [
              44
            ],
            "duration_lesser": [
              44
            ],
            "endDate": [
              41
            ],
            "endDate_greater": [
              41
            ],
            "endDate_lesser": [
              41
            ],
            "endDate_like": [
              139
            ],
            "episodes": [
              44
            ],
            "episodes_greater": [
              44
            ],
            "episodes_lesser": [
              44
            ],
            "format": [
              62
            ],
            "format_in": [
              62,
              "[MediaFormat]"
            ],
            "format_not": [
              62
            ],
            "format_not_in": [
              62,
              "[MediaFormat]"
            ],
            "genre": [
              139
            ],
            "genre_in": [
              139,
              "[String]"
            ],
            "genre_not_in": [
              139,
              "[String]"
            ],
            "id": [
              44
            ],
            "idMal": [
              44
            ],
            "idMal_in": [
              44,
              "[Int]"
            ],
            "idMal_not": [
              44
            ],
            "idMal_not_in": [
              44,
              "[Int]"
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "isAdult": [
              19
            ],
            "isLicensed": [
              19
            ],
            "licensedBy": [
              139
            ],
            "licensedById": [
              44
            ],
            "licensedById_in": [
              44,
              "[Int]"
            ],
            "licensedBy_in": [
              139,
              "[String]"
            ],
            "minimumTagRank": [
              44
            ],
            "onList": [
              19
            ],
            "popularity": [
              44
            ],
            "popularity_greater": [
              44
            ],
            "popularity_lesser": [
              44
            ],
            "popularity_not": [
              44
            ],
            "search": [
              139
            ],
            "season": [
              75
            ],
            "seasonYear": [
              44
            ],
            "sort": [
              76,
              "[MediaSort]"
            ],
            "source": [
              77
            ],
            "source_in": [
              77,
              "[MediaSource]"
            ],
            "startDate": [
              41
            ],
            "startDate_greater": [
              41
            ],
            "startDate_lesser": [
              41
            ],
            "startDate_like": [
              139
            ],
            "status": [
              79
            ],
            "status_in": [
              79,
              "[MediaStatus]"
            ],
            "status_not": [
              79
            ],
            "status_not_in": [
              79,
              "[MediaStatus]"
            ],
            "tag": [
              139
            ],
            "tagCategory": [
              139
            ],
            "tagCategory_in": [
              139,
              "[String]"
            ],
            "tagCategory_not_in": [
              139,
              "[String]"
            ],
            "tag_in": [
              139,
              "[String]"
            ],
            "tag_not_in": [
              139,
              "[String]"
            ],
            "type": [
              92
            ],
            "volumes": [
              44
            ],
            "volumes_greater": [
              44
            ],
            "volumes_lesser": [
              44
            ]
          }
        ],
        "MediaList": [
          63,
          {
            "compareWithAuthList": [
              19
            ],
            "completedAt": [
              41
            ],
            "completedAt_greater": [
              41
            ],
            "completedAt_lesser": [
              41
            ],
            "completedAt_like": [
              139
            ],
            "id": [
              44
            ],
            "isFollowing": [
              19
            ],
            "mediaId": [
              44
            ],
            "mediaId_in": [
              44,
              "[Int]"
            ],
            "mediaId_not_in": [
              44,
              "[Int]"
            ],
            "notes": [
              139
            ],
            "notes_like": [
              139
            ],
            "sort": [
              68,
              "[MediaListSort]"
            ],
            "startedAt": [
              41
            ],
            "startedAt_greater": [
              41
            ],
            "startedAt_lesser": [
              41
            ],
            "startedAt_like": [
              139
            ],
            "status": [
              69
            ],
            "status_in": [
              69,
              "[MediaListStatus]"
            ],
            "status_not": [
              69
            ],
            "status_not_in": [
              69,
              "[MediaListStatus]"
            ],
            "type": [
              92
            ],
            "userId": [
              44
            ],
            "userId_in": [
              44,
              "[Int]"
            ],
            "userName": [
              139
            ]
          }
        ],
        "MediaListCollection": [
          64,
          {
            "chunk": [
              44
            ],
            "completedAt": [
              41
            ],
            "completedAt_greater": [
              41
            ],
            "completedAt_lesser": [
              41
            ],
            "completedAt_like": [
              139
            ],
            "forceSingleCompletedList": [
              19
            ],
            "notes": [
              139
            ],
            "notes_like": [
              139
            ],
            "perChunk": [
              44
            ],
            "sort": [
              68,
              "[MediaListSort]"
            ],
            "startedAt": [
              41
            ],
            "startedAt_greater": [
              41
            ],
            "startedAt_lesser": [
              41
            ],
            "startedAt_like": [
              139
            ],
            "status": [
              69
            ],
            "status_in": [
              69,
              "[MediaListStatus]"
            ],
            "status_not": [
              69
            ],
            "status_not_in": [
              69,
              "[MediaListStatus]"
            ],
            "type": [
              92
            ],
            "userId": [
              44
            ],
            "userName": [
              139
            ]
          }
        ],
        "MediaTagCollection": [
          84,
          {
            "status": [
              44
            ]
          }
        ],
        "MediaTrend": [
          88,
          {
            "averageScore": [
              44
            ],
            "averageScore_greater": [
              44
            ],
            "averageScore_lesser": [
              44
            ],
            "averageScore_not": [
              44
            ],
            "date": [
              44
            ],
            "date_greater": [
              44
            ],
            "date_lesser": [
              44
            ],
            "episode": [
              44
            ],
            "episode_greater": [
              44
            ],
            "episode_lesser": [
              44
            ],
            "episode_not": [
              44
            ],
            "mediaId": [
              44
            ],
            "mediaId_in": [
              44,
              "[Int]"
            ],
            "mediaId_not": [
              44
            ],
            "mediaId_not_in": [
              44,
              "[Int]"
            ],
            "popularity": [
              44
            ],
            "popularity_greater": [
              44
            ],
            "popularity_lesser": [
              44
            ],
            "popularity_not": [
              44
            ],
            "releasing": [
              19
            ],
            "sort": [
              91,
              "[MediaTrendSort]"
            ],
            "trending": [
              44
            ],
            "trending_greater": [
              44
            ],
            "trending_lesser": [
              44
            ],
            "trending_not": [
              44
            ]
          }
        ],
        "Notification": [
          101,
          {
            "resetNotificationCount": [
              19
            ],
            "type": [
              100
            ],
            "type_in": [
              100,
              "[NotificationType]"
            ]
          }
        ],
        "Page": [
          102,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ]
          }
        ],
        "Recommendation": [
          106,
          {
            "id": [
              44
            ],
            "mediaId": [
              44
            ],
            "mediaRecommendationId": [
              44
            ],
            "onList": [
              19
            ],
            "rating": [
              44
            ],
            "rating_greater": [
              44
            ],
            "rating_lesser": [
              44
            ],
            "sort": [
              110,
              "[RecommendationSort]"
            ],
            "userId": [
              44
            ]
          }
        ],
        "Review": [
          113,
          {
            "id": [
              44
            ],
            "mediaId": [
              44
            ],
            "mediaType": [
              92
            ],
            "sort": [
              117,
              "[ReviewSort]"
            ],
            "userId": [
              44
            ]
          }
        ],
        "SiteStatistics": [
          122
        ],
        "Staff": [
          127,
          {
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "isBirthday": [
              19
            ],
            "search": [
              139
            ],
            "sort": [
              135,
              "[StaffSort]"
            ]
          }
        ],
        "Studio": [
          140,
          {
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "id_not": [
              44
            ],
            "id_not_in": [
              44,
              "[Int]"
            ],
            "search": [
              139
            ],
            "sort": [
              143,
              "[StudioSort]"
            ]
          }
        ],
        "Thread": [
          149,
          {
            "categoryId": [
              44
            ],
            "id": [
              44
            ],
            "id_in": [
              44,
              "[Int]"
            ],
            "mediaCategoryId": [
              44
            ],
            "replyUserId": [
              44
            ],
            "search": [
              139
            ],
            "sort": [
              158,
              "[ThreadSort]"
            ],
            "subscribed": [
              19
            ],
            "userId": [
              44
            ]
          }
        ],
        "ThreadComment": [
          151,
          {
            "id": [
              44
            ],
            "sort": [
              155,
              "[ThreadCommentSort]"
            ],
            "threadId": [
              44
            ],
            "userId": [
              44
            ]
          }
        ],
        "User": [
          159,
          {
            "id": [
              44
            ],
            "isModerator": [
              19
            ],
            "name": [
              139
            ],
            "search": [
              139
            ],
            "sort": [
              171,
              "[UserSort]"
            ]
          }
        ],
        "Viewer": [
          159
        ],
        "__typename": [
          139
        ]
      },
      "Recommendation": {
        "id": [
          44
        ],
        "media": [
          53
        ],
        "mediaRecommendation": [
          53
        ],
        "rating": [
          44
        ],
        "user": [
          159
        ],
        "userRating": [
          109
        ],
        "__typename": [
          139
        ]
      },
      "RecommendationConnection": {
        "edges": [
          108
        ],
        "nodes": [
          106
        ],
        "pageInfo": [
          103
        ],
        "__typename": [
          139
        ]
      },
      "RecommendationEdge": {
        "node": [
          106
        ],
        "__typename": [
          139
        ]
      },
      "RecommendationRating": {},
      "RecommendationSort": {},
      "RelatedMediaAdditionNotification": {
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "media": [
          53
        ],
        "mediaId": [
          44
        ],
        "type": [
          100
        ],
        "__typename": [
          139
        ]
      },
      "Report": {
        "cleared": [
          19
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "reason": [
          139
        ],
        "reported": [
          159
        ],
        "reporter": [
          159
        ],
        "__typename": [
          139
        ]
      },
      "Review": {
        "body": [
          139,
          {
            "asHtml": [
              19
            ]
          }
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "media": [
          53
        ],
        "mediaId": [
          44
        ],
        "mediaType": [
          92
        ],
        "private": [
          19
        ],
        "rating": [
          44
        ],
        "ratingAmount": [
          44
        ],
        "score": [
          44
        ],
        "siteUrl": [
          139
        ],
        "summary": [
          139
        ],
        "updatedAt": [
          44
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "userRating": [
          116
        ],
        "__typename": [
          139
        ]
      },
      "ReviewConnection": {
        "edges": [
          115
        ],
        "nodes": [
          113
        ],
        "pageInfo": [
          103
        ],
        "__typename": [
          139
        ]
      },
      "ReviewEdge": {
        "node": [
          113
        ],
        "__typename": [
          139
        ]
      },
      "ReviewRating": {},
      "ReviewSort": {},
      "RevisionHistory": {
        "action": [
          119
        ],
        "changes": [
          46
        ],
        "character": [
          20
        ],
        "createdAt": [
          44
        ],
        "externalLink": [
          60
        ],
        "id": [
          44
        ],
        "media": [
          53
        ],
        "staff": [
          127
        ],
        "studio": [
          140
        ],
        "user": [
          159
        ],
        "__typename": [
          139
        ]
      },
      "RevisionHistoryAction": {},
      "ScoreDistribution": {
        "amount": [
          44
        ],
        "score": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ScoreFormat": {},
      "SiteStatistics": {
        "anime": [
          124,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              126,
              "[SiteTrendSort]"
            ]
          }
        ],
        "characters": [
          124,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              126,
              "[SiteTrendSort]"
            ]
          }
        ],
        "manga": [
          124,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              126,
              "[SiteTrendSort]"
            ]
          }
        ],
        "reviews": [
          124,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              126,
              "[SiteTrendSort]"
            ]
          }
        ],
        "staff": [
          124,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              126,
              "[SiteTrendSort]"
            ]
          }
        ],
        "studios": [
          124,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              126,
              "[SiteTrendSort]"
            ]
          }
        ],
        "users": [
          124,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              126,
              "[SiteTrendSort]"
            ]
          }
        ],
        "__typename": [
          139
        ]
      },
      "SiteTrend": {
        "change": [
          44
        ],
        "count": [
          44
        ],
        "date": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "SiteTrendConnection": {
        "edges": [
          125
        ],
        "nodes": [
          123
        ],
        "pageInfo": [
          103
        ],
        "__typename": [
          139
        ]
      },
      "SiteTrendEdge": {
        "node": [
          123
        ],
        "__typename": [
          139
        ]
      },
      "SiteTrendSort": {},
      "Staff": {
        "age": [
          44
        ],
        "bloodType": [
          139
        ],
        "characterMedia": [
          55,
          {
            "onList": [
              19
            ],
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              76,
              "[MediaSort]"
            ]
          }
        ],
        "characters": [
          21,
          {
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              27,
              "[CharacterSort]"
            ]
          }
        ],
        "dateOfBirth": [
          39
        ],
        "dateOfDeath": [
          39
        ],
        "description": [
          139,
          {
            "asHtml": [
              19
            ]
          }
        ],
        "favourites": [
          44
        ],
        "gender": [
          139
        ],
        "homeTown": [
          139
        ],
        "id": [
          44
        ],
        "image": [
          130
        ],
        "isFavourite": [
          19
        ],
        "isFavouriteBlocked": [
          19
        ],
        "language": [
          131
        ],
        "languageV2": [
          139
        ],
        "modNotes": [
          139
        ],
        "name": [
          132
        ],
        "primaryOccupations": [
          139
        ],
        "siteUrl": [
          139
        ],
        "staff": [
          127
        ],
        "staffMedia": [
          55,
          {
            "onList": [
              19
            ],
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              76,
              "[MediaSort]"
            ],
            "type": [
              92
            ]
          }
        ],
        "submissionNotes": [
          139
        ],
        "submissionStatus": [
          44
        ],
        "submitter": [
          159
        ],
        "updatedAt": [
          44
        ],
        "yearsActive": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "StaffConnection": {
        "edges": [
          129
        ],
        "nodes": [
          127
        ],
        "pageInfo": [
          103
        ],
        "__typename": [
          139
        ]
      },
      "StaffEdge": {
        "favouriteOrder": [
          44
        ],
        "id": [
          44
        ],
        "node": [
          127
        ],
        "role": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "StaffImage": {
        "large": [
          139
        ],
        "medium": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "StaffLanguage": {},
      "StaffName": {
        "alternative": [
          139
        ],
        "first": [
          139
        ],
        "full": [
          139
        ],
        "last": [
          139
        ],
        "middle": [
          139
        ],
        "native": [
          139
        ],
        "userPreferred": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "StaffNameInput": {
        "alternative": [
          139
        ],
        "first": [
          139
        ],
        "last": [
          139
        ],
        "middle": [
          139
        ],
        "native": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "StaffRoleType": {
        "dubGroup": [
          139
        ],
        "roleNotes": [
          139
        ],
        "voiceActor": [
          127
        ],
        "__typename": [
          139
        ]
      },
      "StaffSort": {},
      "StaffStats": {
        "amount": [
          44
        ],
        "meanScore": [
          44
        ],
        "staff": [
          127
        ],
        "timeWatched": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "StaffSubmission": {
        "assignee": [
          159
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "locked": [
          19
        ],
        "notes": [
          139
        ],
        "source": [
          139
        ],
        "staff": [
          127
        ],
        "status": [
          146
        ],
        "submission": [
          127
        ],
        "submitter": [
          159
        ],
        "__typename": [
          139
        ]
      },
      "StatusDistribution": {
        "amount": [
          44
        ],
        "status": [
          69
        ],
        "__typename": [
          139
        ]
      },
      "String": {},
      "Studio": {
        "favourites": [
          44
        ],
        "id": [
          44
        ],
        "isAnimationStudio": [
          19
        ],
        "isFavourite": [
          19
        ],
        "media": [
          55,
          {
            "isMain": [
              19
            ],
            "onList": [
              19
            ],
            "page": [
              44
            ],
            "perPage": [
              44
            ],
            "sort": [
              76,
              "[MediaSort]"
            ]
          }
        ],
        "name": [
          139
        ],
        "siteUrl": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "StudioConnection": {
        "edges": [
          142
        ],
        "nodes": [
          140
        ],
        "pageInfo": [
          103
        ],
        "__typename": [
          139
        ]
      },
      "StudioEdge": {
        "favouriteOrder": [
          44
        ],
        "id": [
          44
        ],
        "isMain": [
          19
        ],
        "node": [
          140
        ],
        "__typename": [
          139
        ]
      },
      "StudioSort": {},
      "StudioStats": {
        "amount": [
          44
        ],
        "meanScore": [
          44
        ],
        "studio": [
          140
        ],
        "timeWatched": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "SubmissionSort": {},
      "SubmissionStatus": {},
      "TagStats": {
        "amount": [
          44
        ],
        "meanScore": [
          44
        ],
        "tag": [
          84
        ],
        "timeWatched": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "TextActivity": {
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "isLiked": [
          19
        ],
        "isLocked": [
          19
        ],
        "isPinned": [
          19
        ],
        "isSubscribed": [
          19
        ],
        "likeCount": [
          44
        ],
        "likes": [
          159
        ],
        "replies": [
          3
        ],
        "replyCount": [
          44
        ],
        "siteUrl": [
          139
        ],
        "text": [
          139,
          {
            "asHtml": [
              19
            ]
          }
        ],
        "type": [
          8
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "Thread": {
        "body": [
          139,
          {
            "asHtml": [
              19
            ]
          }
        ],
        "categories": [
          150
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "isLiked": [
          19
        ],
        "isLocked": [
          19
        ],
        "isSticky": [
          19
        ],
        "isSubscribed": [
          19
        ],
        "likeCount": [
          44
        ],
        "likes": [
          159
        ],
        "mediaCategories": [
          53
        ],
        "repliedAt": [
          44
        ],
        "replyCommentId": [
          44
        ],
        "replyCount": [
          44
        ],
        "replyUser": [
          159
        ],
        "replyUserId": [
          44
        ],
        "siteUrl": [
          139
        ],
        "title": [
          139
        ],
        "updatedAt": [
          44
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "viewCount": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ThreadCategory": {
        "id": [
          44
        ],
        "name": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "ThreadComment": {
        "childComments": [
          46
        ],
        "comment": [
          139,
          {
            "asHtml": [
              19
            ]
          }
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "isLiked": [
          19
        ],
        "isLocked": [
          19
        ],
        "likeCount": [
          44
        ],
        "likes": [
          159
        ],
        "siteUrl": [
          139
        ],
        "thread": [
          149
        ],
        "threadId": [
          44
        ],
        "updatedAt": [
          44
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ThreadCommentLikeNotification": {
        "comment": [
          151
        ],
        "commentId": [
          44
        ],
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "thread": [
          149
        ],
        "type": [
          100
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ThreadCommentMentionNotification": {
        "comment": [
          151
        ],
        "commentId": [
          44
        ],
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "thread": [
          149
        ],
        "type": [
          100
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ThreadCommentReplyNotification": {
        "comment": [
          151
        ],
        "commentId": [
          44
        ],
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "thread": [
          149
        ],
        "type": [
          100
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ThreadCommentSort": {},
      "ThreadCommentSubscribedNotification": {
        "comment": [
          151
        ],
        "commentId": [
          44
        ],
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "thread": [
          149
        ],
        "type": [
          100
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ThreadLikeNotification": {
        "comment": [
          151
        ],
        "context": [
          139
        ],
        "createdAt": [
          44
        ],
        "id": [
          44
        ],
        "thread": [
          149
        ],
        "threadId": [
          44
        ],
        "type": [
          100
        ],
        "user": [
          159
        ],
        "userId": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "ThreadSort": {},
      "User": {
        "about": [
          139,
          {
            "asHtml": [
              19
            ]
          }
        ],
        "avatar": [
          161
        ],
        "bannerImage": [
          139
        ],
        "bans": [
          46
        ],
        "createdAt": [
          44
        ],
        "donatorBadge": [
          139
        ],
        "donatorTier": [
          44
        ],
        "favourites": [
          35,
          {
            "page": [
              44
            ]
          }
        ],
        "id": [
          44
        ],
        "isBlocked": [
          19
        ],
        "isFollower": [
          19
        ],
        "isFollowing": [
          19
        ],
        "mediaListOptions": [
          66
        ],
        "moderatorRoles": [
          96
        ],
        "moderatorStatus": [
          139
        ],
        "name": [
          139
        ],
        "options": [
          167
        ],
        "previousNames": [
          168
        ],
        "siteUrl": [
          139
        ],
        "statistics": [
          175
        ],
        "stats": [
          178
        ],
        "unreadNotificationCount": [
          44
        ],
        "updatedAt": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "UserActivityHistory": {
        "amount": [
          44
        ],
        "date": [
          44
        ],
        "level": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "UserAvatar": {
        "large": [
          139
        ],
        "medium": [
          139
        ],
        "__typename": [
          139
        ]
      },
      "UserCountryStatistic": {
        "chaptersRead": [
          44
        ],
        "count": [
          44
        ],
        "country": [
          31
        ],
        "meanScore": [
          36
        ],
        "mediaIds": [
          44
        ],
        "minutesWatched": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "UserFormatStatistic": {
        "chaptersRead": [
          44
        ],
        "count": [
          44
        ],
        "format": [
          62
        ],
        "meanScore": [
          36
        ],
        "mediaIds": [
          44
        ],
        "minutesWatched": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "UserGenreStatistic": {
        "chaptersRead": [
          44
        ],
        "count": [
          44
        ],
        "genre": [
          139
        ],
        "meanScore": [
          36
        ],
        "mediaIds": [
          44
        ],
        "minutesWatched": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "UserLengthStatistic": {
        "chaptersRead": [
          44
        ],
        "count": [
          44
        ],
        "length": [
          139
        ],
        "meanScore": [
          36
        ],
        "mediaIds": [
          44
        ],
        "minutesWatched": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "UserModData": {
        "alts": [
          159
        ],
        "bans": [
          46
        ],
        "counts": [
          46
        ],
        "email": [
          139
        ],
        "ip": [
          46
        ],
        "privacy": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "UserOptions": {
        "activityMergeTime": [
          44
        ],
        "airingNotifications": [
          19
        ],
        "disabledListActivity": [
          50
        ],
        "displayAdultContent": [
          19
        ],
        "notificationOptions": [
          98
        ],
        "profileColor": [
          139
        ],
        "restrictMessagesToFollowing": [
          19
        ],
        "staffNameLanguage": [
          172
        ],
        "timezone": [
          139
        ],
        "titleLanguage": [
          182
        ],
        "__typename": [
          139
        ]
      },
      "UserPreviousName": {
        "createdAt": [
          44
        ],
        "name": [
          139
        ],
        "updatedAt": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "UserReleaseYearStatistic": {
        "chaptersRead": [
          44
        ],
        "count": [
          44
        ],
        "meanScore": [
          36
        ],
        "mediaIds": [
          44
        ],
        "minutesWatched": [
          44
        ],
        "releaseYear": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "UserScoreStatistic": {
        "chaptersRead": [
          44
        ],
        "count": [
          44
        ],
        "meanScore": [
          36
        ],
        "mediaIds": [
          44
        ],
        "minutesWatched": [
          44
        ],
        "score": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "UserSort": {},
      "UserStaffNameLanguage": {},
      "UserStaffStatistic": {
        "chaptersRead": [
          44
        ],
        "count": [
          44
        ],
        "meanScore": [
          36
        ],
        "mediaIds": [
          44
        ],
        "minutesWatched": [
          44
        ],
        "staff": [
          127
        ],
        "__typename": [
          139
        ]
      },
      "UserStartYearStatistic": {
        "chaptersRead": [
          44
        ],
        "count": [
          44
        ],
        "meanScore": [
          36
        ],
        "mediaIds": [
          44
        ],
        "minutesWatched": [
          44
        ],
        "startYear": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "UserStatisticTypes": {
        "anime": [
          176
        ],
        "manga": [
          176
        ],
        "__typename": [
          139
        ]
      },
      "UserStatistics": {
        "chaptersRead": [
          44
        ],
        "count": [
          44
        ],
        "countries": [
          162,
          {
            "limit": [
              44
            ],
            "sort": [
              177,
              "[UserStatisticsSort]"
            ]
          }
        ],
        "episodesWatched": [
          44
        ],
        "formats": [
          163,
          {
            "limit": [
              44
            ],
            "sort": [
              177,
              "[UserStatisticsSort]"
            ]
          }
        ],
        "genres": [
          164,
          {
            "limit": [
              44
            ],
            "sort": [
              177,
              "[UserStatisticsSort]"
            ]
          }
        ],
        "lengths": [
          165,
          {
            "limit": [
              44
            ],
            "sort": [
              177,
              "[UserStatisticsSort]"
            ]
          }
        ],
        "meanScore": [
          36
        ],
        "minutesWatched": [
          44
        ],
        "releaseYears": [
          169,
          {
            "limit": [
              44
            ],
            "sort": [
              177,
              "[UserStatisticsSort]"
            ]
          }
        ],
        "scores": [
          170,
          {
            "limit": [
              44
            ],
            "sort": [
              177,
              "[UserStatisticsSort]"
            ]
          }
        ],
        "staff": [
          173,
          {
            "limit": [
              44
            ],
            "sort": [
              177,
              "[UserStatisticsSort]"
            ]
          }
        ],
        "standardDeviation": [
          36
        ],
        "startYears": [
          174,
          {
            "limit": [
              44
            ],
            "sort": [
              177,
              "[UserStatisticsSort]"
            ]
          }
        ],
        "statuses": [
          179,
          {
            "limit": [
              44
            ],
            "sort": [
              177,
              "[UserStatisticsSort]"
            ]
          }
        ],
        "studios": [
          180,
          {
            "limit": [
              44
            ],
            "sort": [
              177,
              "[UserStatisticsSort]"
            ]
          }
        ],
        "tags": [
          181,
          {
            "limit": [
              44
            ],
            "sort": [
              177,
              "[UserStatisticsSort]"
            ]
          }
        ],
        "voiceActors": [
          183,
          {
            "limit": [
              44
            ],
            "sort": [
              177,
              "[UserStatisticsSort]"
            ]
          }
        ],
        "volumesRead": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "UserStatisticsSort": {},
      "UserStats": {
        "activityHistory": [
          160
        ],
        "animeListScores": [
          52
        ],
        "animeScoreDistribution": [
          120
        ],
        "animeStatusDistribution": [
          138
        ],
        "chaptersRead": [
          44
        ],
        "favouredActors": [
          136
        ],
        "favouredFormats": [
          38
        ],
        "favouredGenres": [
          42
        ],
        "favouredGenresOverview": [
          42
        ],
        "favouredStaff": [
          136
        ],
        "favouredStudios": [
          144
        ],
        "favouredTags": [
          147
        ],
        "favouredYears": [
          184
        ],
        "mangaListScores": [
          52
        ],
        "mangaScoreDistribution": [
          120
        ],
        "mangaStatusDistribution": [
          138
        ],
        "watchedTime": [
          44
        ],
        "__typename": [
          139
        ]
      },
      "UserStatusStatistic": {
        "chaptersRead": [
          44
        ],
        "count": [
          44
        ],
        "meanScore": [
          36
        ],
        "mediaIds": [
          44
        ],
        "minutesWatched": [
          44
        ],
        "status": [
          69
        ],
        "__typename": [
          139
        ]
      },
      "UserStudioStatistic": {
        "chaptersRead": [
          44
        ],
        "count": [
          44
        ],
        "meanScore": [
          36
        ],
        "mediaIds": [
          44
        ],
        "minutesWatched": [
          44
        ],
        "studio": [
          140
        ],
        "__typename": [
          139
        ]
      },
      "UserTagStatistic": {
        "chaptersRead": [
          44
        ],
        "count": [
          44
        ],
        "meanScore": [
          36
        ],
        "mediaIds": [
          44
        ],
        "minutesWatched": [
          44
        ],
        "tag": [
          84
        ],
        "__typename": [
          139
        ]
      },
      "UserTitleLanguage": {},
      "UserVoiceActorStatistic": {
        "chaptersRead": [
          44
        ],
        "characterIds": [
          44
        ],
        "count": [
          44
        ],
        "meanScore": [
          36
        ],
        "mediaIds": [
          44
        ],
        "minutesWatched": [
          44
        ],
        "voiceActor": [
          127
        ],
        "__typename": [
          139
        ]
      },
      "YearStats": {
        "amount": [
          44
        ],
        "meanScore": [
          44
        ],
        "year": [
          44
        ],
        "__typename": [
          139
        ]
      }
    }
  };

  // src/genql/index.ts
  var typeMap = linkTypeMap(types_default);
  var createClient2 = function(options) {
    return createClient({
      url: "https://graphql.anilist.co",
      ...options,
      queryRoot: typeMap.Query,
      mutationRoot: typeMap.Mutation,
      subscriptionRoot: typeMap.Subscription
    });
  };

  // src/anilist.ts
  var client_id = "17318";
  var anilistToken = localStorage.getItem("anilistToken");
  var anilistUserId = Number(localStorage.getItem("anilistUserId"));
  var anilistClient = createClient2({
    url: "https://graphql.anilist.co",
    batch: {
      batchInterval: 100,
      maxBatchSize: 10
    },
    headers: () => {
      if (!anilistToken) {
        throw new Error("Not logged in to AniList");
      }
      return {
        Authorization: `Bearer ${anilistToken}`
      };
    }
  });
  function isAuthenticated() {
    return Boolean(anilistToken);
  }
  function logout() {
    anilistToken = null;
    anilistUserId = 0;
    localStorage.removeItem("anilistToken");
    localStorage.removeItem("anilistUserId");
    window.location.reload();
  }
  function getLoginUrl() {
    return `https://anilist.co/api/v2/oauth/authorize?client_id=${client_id}&response_type=token`;
  }
  (async function processLogin() {
    const hashToken = new URLSearchParams(window.location.hash.slice(1)).get("access_token");
    if (!hashToken) {
      return;
    }
    anilistToken = hashToken;
    window.location.hash = "";
    const { Viewer: user } = await anilistClient.query({
      Viewer: {
        id: true,
        name: true
      }
    });
    if (!user) {
      throw new Error("Failed to get AniList user info");
    }
    anilistUserId = user.id;
    localStorage.setItem("anilistToken", anilistToken);
    localStorage.setItem("anilistUserId", String(anilistUserId));
    alert(`Successfully logged in to AniList as ${user.name} (#${anilistUserId})`);
  })();
  function findAnilistId(links) {
    for (let link of links) {
      const match = link.href.match(/anilist.co\/anime\/(\d+)/i);
      if (match) {
        return Number(match[1]);
      }
    }
  }
  async function getStatus(anilistId) {
    return await anilistClient.query({
      MediaList: {
        __args: {
          userId: anilistUserId,
          mediaId: anilistId
        },
        status: true,
        progress: true,
        score: true,
        media: {
          episodes: true
        }
      }
    }).then(
      (x) => x.MediaList,
      (error) => {
        console.error("Failed to get AniList status", error);
        return null;
      }
    );
  }
  async function updateProgress(anilistId, progress, setWatching) {
    return anilistClient.mutation({
      SaveMediaListEntry: {
        __args: {
          mediaId: anilistId,
          progress,
          status: setWatching ? "CURRENT" : void 0
        },
        progress: true
      }
    });
  }

  // src/persistence.ts
  function saveAnimeInfo(info) {
    localStorage.setItem(`info-${info.id}`, JSON.stringify(info));
  }
  function loadAnimeInfo(id) {
    return JSON.parse(localStorage.getItem(`info-${id}`) || "null") || void 0;
  }

  // src/types.ts
  var ANIME_INFO_VERSION = 1;
  var RateLimitError = class extends Error {
    constructor() {
      super("Rate limit exceeded");
    }
  };
  var ONE_HOUR = 1e3 * 60 * 60;
  function isInfoOutdated(info) {
    const lastUpdatedSince = Date.now() - (info.updatedAt || 0);
    return info.version !== ANIME_INFO_VERSION || lastUpdatedSince > ONE_HOUR * (info.streams.length === 0 ? 6 : 24 * 2);
  }

  // src/getAnimeInfo.ts
  function getAnimeUrl(id) {
    return `https://www.livechart.me/anime/${id}`;
  }
  async function getAnimeInfo(id, useCache = true) {
    const info = !useCache ? void 0 : loadAnimeInfo(id);
    if (info && !isInfoOutdated(info)) {
      console.debug(`Loaded anime info [${id}] "${info.title}"`, info);
      return info;
    }
    while (true) {
      const doc = await fetchAnimeInfoDoc(id);
      if (!doc) {
        return;
      }
      try {
        return processAnimeInfo(doc);
      } catch (e) {
        if (e instanceof RateLimitError) {
          console.warn("Rate limit exceeded, waiting 5 seconds");
          await new Promise((r) => setTimeout(r, 5e3));
        } else {
          console.error(`Error fetching anime info [${id}]`, e);
          return;
        }
      }
    }
  }
  async function fetchAnimeInfoDoc(id) {
    const templateId = `anime-${id}`;
    let templateEl;
    if (!templateEl) {
      const url = getAnimeUrl(id);
      const html = await fetch(url).then((x) => x.text());
      templateEl = document.createElement("template");
      templateEl.innerHTML = html;
      templateEl.id = templateId;
      if (true) {
        document.body.append(templateEl);
      }
      await new Promise((r) => setTimeout(r, 2e3));
    }
    return templateEl.content;
  }
  var ANIME_INFO_STREAMS_SELECTOR = '[data-controller="anime-details"] .grid.md\\:grid-cols-2 .card.bg-base-300 .flex .flex-1 a';
  function processAnimeInfo(doc) {
    const ogUrl = doc.querySelector('meta[property="og:url"]')?.content;
    if (!ogUrl) {
      throw new RateLimitError();
    }
    const id = ogUrl.match(/\/anime\/(\d+)/)?.[1];
    if (!id) {
      throw new Error(`Could parse anime id from ${ogUrl}`);
    }
    const title = doc.querySelector('meta[property="og:title"]')?.content;
    if (!title) {
      throw new Error(`Could not find title for anime ${ogUrl}`);
    }
    const linkElements = Array.from(doc.querySelectorAll("a"));
    const anilistId = findAnilistId(linkElements);
    const streams = Array.from(doc.querySelectorAll(ANIME_INFO_STREAMS_SELECTOR)).map((x) => ({
      href: x.href,
      logo: x.parentElement?.previousSibling?.src
    })).filter((x) => !x.href.includes("crunchyroll.com/videos"));
    const info = Object.freeze({
      version: ANIME_INFO_VERSION,
      id,
      title,
      streams,
      anilistId,
      updatedAt: Date.now()
    });
    console.debug(`Fetched anime info [${id}] "${info.title}"`, info);
    saveAnimeInfo(info);
    return info;
  }

  // src/utils.ts
  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function getShortName(title, maxLength = 32) {
    let result = "";
    for (const part of title.split(" ")) {
      if (result && result.length + part.length > maxLength) {
        result += "...";
        break;
      }
      result += ` ${part}`;
    }
    return result;
  }

  // src/decorate.tsx
  var anilistStatusRef = createRef();
  async function decoratePage() {
    const headerEl = document.querySelector(
      '[data-controller="schedule"] .lc-chip-button.lc-chip-button-outline:last-of-type'
    );
    if (headerEl) {
      const btn = isAuthenticated() ? /* @__PURE__ */ createElement(createFragment, null, /* @__PURE__ */ createElement(
        "button",
        {
          class: "lc-chip-button lc-chip-button-outline",
          onClick: () => logout()
        },
        /* @__PURE__ */ createElement("img", { class: "w-5 mr-2", src: "https://anilist.co/img/icons/favicon-32x32.png" }),
        "Logout"
      ), /* @__PURE__ */ createElement("div", { class: "h-8 px-2 rounded-full border border-base-content/20 flex items-center min-w-0" }, /* @__PURE__ */ createElement("img", { class: "w-5 mr-2", src: "https://anilist.co/img/icons/favicon-32x32.png" }), /* @__PURE__ */ createElement("span", { ref: anilistStatusRef, class: "truncate" }, "Logged in"))) : /* @__PURE__ */ createElement(
        "a",
        {
          class: "lc-chip-button lc-chip-button-outline",
          href: getLoginUrl(),
          title: "Login with AniList"
        },
        /* @__PURE__ */ createElement("img", { class: "w-5", src: "https://anilist.co/img/icons/favicon-32x32.png" })
      );
      headerEl.after(...Array.isArray(btn) ? btn : [btn]);
    }
    const elements = document.querySelectorAll(".lc-timetable-anime-block");
    for (let el of elements) {
      await decorateAnimeBlock(el, true);
    }
    for (let el of elements) {
      await decorateAnimeBlock(el);
    }
  }
  async function decorateAnimeBlock(el, disableFetch = false) {
    const id = el.dataset.scheduleAnimeId;
    if (!id) {
      throw new Error("No anime id data attribute found");
    }
    const info = disableFetch ? loadAnimeInfo(id) : await getAnimeInfo(id);
    if (!info) {
      return;
    }
    const topStream = info.streams.find((x) => x.href.includes("crunchyroll")) || info.streams[0];
    if (topStream) {
      let watchBtnContainer = el.querySelector(".lc-tt-action-button-wrap");
      if (!watchBtnContainer) {
        watchBtnContainer = /* @__PURE__ */ createElement("div", { class: "overflow-hidden lc-tt-action-button-wrap" }, /* @__PURE__ */ createElement(
          "a",
          {
            class: "lc-tt-action-button lc-release-schedule-action-button lc-btn-xs",
            href: topStream.href,
            target: "_blank",
            rel: "nofollow noopener",
            title: "Watch"
          },
          /* @__PURE__ */ createElement("img", { class: "h-4", src: topStream.logo })
        ));
        el.append(watchBtnContainer);
      }
    }
    const progressBtn = el.querySelector(
      "[data-schedule-anime-target=progressJumpButton]"
    );
    if (progressBtn && !progressBtn.dataset.decorated) {
      const title = progressBtn.title;
      const episode = Number(title.match(/\d+/)?.[0]);
      if (!Number.isNaN(episode)) {
        progressBtn.addEventListener("click", async () => {
          await delay(100);
          const shortTitle = getShortName(info.title);
          if (info.anilistId && isAuthenticated()) {
            let setWatching = true;
            let status = await getStatus(info.anilistId);
            if (status) {
              if (status.status === "COMPLETED") {
                setStatus(`Status already complete: "${shortTitle}`);
                return;
              }
              if (status.progress && status.progress >= episode) {
                setStatus(`Episode already watched: "${shortTitle}`);
                return;
              }
              setWatching = Boolean(
                status.status !== "CURRENT" && status.media?.episodes && episode < status.media.episodes
              );
              setStatus(`Updating "${shortTitle}"...`);
            } else {
              setStatus(`Adding "${shortTitle}"...`);
            }
            try {
              await updateProgress(info.anilistId, episode, setWatching);
              setStatus(`Updated "${shortTitle}" to episode ${episode}`);
            } catch (error) {
              console.error("Failed to update progress on AniList", error);
              setStatus(`Error updating "${shortTitle}"`, true);
            }
            await delay(5e3);
          }
        });
        progressBtn.dataset.decorated = "true";
      }
    }
  }
  function setStatus(status, error) {
    if (!anilistStatusRef.current) {
      return;
    }
    anilistStatusRef.current.textContent = status;
    if (error) {
      anilistStatusRef.current.classList.add("text-error");
    } else {
      anilistStatusRef.current.classList.remove("text-error");
    }
  }

  // src/index.ts
  var streamOverrides = JSON.parse(localStorage.getItem(`stream-overrides`) || "{}");
  async function addStreamOverride(id, href, logo = "https://u.livechart.me/streaming_service/248/logo/e0e43ed5e6191cea23520a1c91808779.png/small.png") {
    streamOverrides[id] = { href, logo };
    localStorage.setItem(`stream-overrides`, JSON.stringify(streamOverrides));
    const info = loadAnimeInfo(id);
    if (info) {
      saveAnimeInfo({ ...info, streams: [{ href, logo }] });
      for (let el of document.querySelectorAll(".timetable-anime-block")) {
        await decorateAnimeBlock(el, true);
      }
    }
  }
  window.livechartToolkit = {
    addStreamOverride,
    getAnimeInfo
  };
  if (window.location.pathname.startsWith("/schedule")) {
    console.log("Decorating timetable page...");
    decoratePage();
  } else {
    const match = window.location.pathname.match(/\/anime\/(\d+)/);
    if (match) {
      const id = match[1];
      console.log("Extracting info from anime page", id);
      processAnimeInfo(document);
    }
  }
})();
