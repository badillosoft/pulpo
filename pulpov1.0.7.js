/*
 * Copyright (c) 2020 Alan Badillo Salas <dragonnomada@gmail.com>
 * MIT Licensed
 * 
 * pulpo.js v1.0.7
 * 
 */

console.log("Pulpo v1.0.7");

function select(query = "body", root = document) {
    return root.querySelector(query);
}

function selectAll(query = "[id]", root = document) {
    return [...root.querySelectorAll(query)];
}

function selectId(id = "app", root = document.body) {
    return select(`#${id}`, root);
}

function registryBangs(node, nodeContext) {
    const bangs = {};
    let hasBangs = false;
    for (let attribute of node.attributes) {
        if (/^\:/.test(attribute.name)) {
            const name = attribute.name.slice(1);

            if (name === "context") {
                node.dataset.context = attribute.value;
                nodeContext = node;
            }

            hasBangs = true;
            bangs[name] = attribute.value;

            if (name === "for") {
                node.hidden = true;
                node.registryBreak = true;
            }
            if (name === "if") {
                node.hidden = true;
                node.registryBreak = true;
            }
        }
    }
    if (hasBangs) {
        for (let name of Object.keys(bangs)) {
            node.removeAttribute(`:${name}`);
        }
        if (node !== nodeContext) {
            node.dataset.context = nodeContext.dataset?.context || "any";
        }
        delete bangs.context;
        if (Object.keys(bangs).length > 0) {
            node.dataset.bangs = JSON.stringify(bangs);
        }
    }
    return nodeContext;
}

function translateWatchers(watchers) {
    const translatedWatchers = {};
    const translate = {
        text: "textContent",
        html: "innerHTML",
        class: "className",
    };

    for (let [key, value] of Object.entries(watchers)) {
        translatedWatchers[translate[key] || key] = value;
    }

    return translatedWatchers;
}

function registryWatchers(node, nodeContext) {
    const watchers = {};
    let hasWatchers = false;
    for (let attribute of node.attributes) {
        if (/^\$/.test(attribute.name)) {
            const name = attribute.name.slice(1);

            hasWatchers = true;
            watchers[name] = attribute.value;
        }
    }
    if (hasWatchers) {
        for (let name of Object.keys(watchers)) {
            node.removeAttribute(`$${name}`);
        }
        if (node !== nodeContext) {
            node.dataset.context = nodeContext.dataset?.context || "any";
        }

        const nextWatchers = translateWatchers(watchers);

        node.dataset.watchers = JSON.stringify(nextWatchers);
    }
}

function registryHandlers(node, nodeContext) {
    const handlers = {};
    let hasHandlers = false;
    for (let attribute of node.attributes) {
        if (/^\@/.test(attribute.name)) {
            const name = attribute.name.slice(1);

            hasHandlers = true;
            handlers[name] = attribute.value;
        }
    }
    if (hasHandlers) {
        for (let name of Object.keys(handlers)) {
            node.removeAttribute(`@${name}`);
        }
        if (node !== nodeContext) {
            node.dataset.context = nodeContext.dataset?.context || "any";
        }
        node.dataset.handlers = JSON.stringify(handlers);
        for (let [name, code] of Object.entries(handlers)) {
            node.addEventListener(name, event => {
                const handlers = window.handlers || {};
                const context = getContext(node.dataset.context);
                new Function(
                    "self",
                    "event",
                    "context",
                    "namespace",
                    "index",
                    ...Object.keys(context),
                    ...Object.keys(handlers),
                    `return (node => (${code}))(self);`
                )(
                    node,
                    event,
                    context,
                    node.dataset.context,
                    context.index || 0,
                    ...Object.values(context),
                    ...Object.values(handlers),
                );
            });
        }
    }
}

function registry(root = document, nodeContext = document) {
    if (root.registry) return;

    for (let node of selectAll(":scope > *", root)) {
        const nextNodeContext = registryBangs(node, nodeContext);
        registryWatchers(node, nextNodeContext);
        registryHandlers(node, nextNodeContext);
        if (node.registryBreak) continue;
        registry(node, nextNodeContext);
    }
}

function setContext(name, protocol) {
    if (protocol === undefined) {
        protocol = name || {};
        name = "any";
    }

    window.context = window.context || {};

    window.context[name] = protocol;

    const proc = (code, node, options = {}) => {
        // console.log("proc", node);
        const handlers = window.handlers || {};
        // console.log(Object.keys(handlers));
        try {
            return new Function(
                "context",
                "options",
                "node",
                ...Object.keys(protocol),
                ...Object.keys(handlers),
                `return (self => (${code}))(context);`
            )(
                protocol,
                options,
                node,
                ...Object.values(protocol),
                ...Object.values(handlers),
            );
        } catch (error) {
            console.warn(error);
        }
    };

    for (let node of selectAll(`[data-context="${name}"]`)) {
        const bangs = JSON.parse(node.dataset?.bangs || "{}");
        for (let [bang, code] of Object.entries(bangs)) {
            if (bang === "for") {
                console.log(`[${node.dataset.context}]`, ":for", code);

                for (let clone of (node.clones || [])) {
                    // console.log("remove", clone);
                    clone.remove();
                }

                const items = proc(code, node);

                node.clones = [];

                let currentClone = node;

                for (let [index, item] of Object.entries(items)) {
                    const clone = node.cloneNode(true);
                    clone.hidden = false;
                    delete clone.dataset.bangs;
                    clone.dataset.context = `${node.dataset.context}:${index}`;
                    if (index === "0") {
                        node.insertAdjacentElement("beforebegin", clone);
                    } else if (index === "1") {
                        node.insertAdjacentElement("afterend", clone);
                        currentClone = clone;
                    } else {
                        currentClone.insertAdjacentElement("afterend", clone);
                        currentClone = clone;
                    }
                    node.clones.push(clone);
                    registry(clone, clone);
                    setContext(clone.dataset.context, {
                        index: Number(index),
                        item,
                        [bangs.each || "item"]: item,
                        ...getContext(clone.dataset.context)
                    });
                }
            }
            if (bang === "if") {
                console.log(`[${node.dataset.context}]`, ":if", code);

                for (let clone of (node.clones || [])) {
                    clone.remove();
                }

                const item = proc(code, node);

                node.clones = [];

                if (item) {
                    const index = bangs.then || Math.random().toString(32);
                    const clone = node.cloneNode(true);
                    clone.hidden = false;
                    delete clone.dataset.bangs;
                    clone.dataset.context = `${node.dataset.context}/${index}`;
                    node.insertAdjacentElement("beforebegin", clone);
                    node.clones.push(clone);
                    registry(clone, clone);
                    setContext(clone.dataset.context, {
                        index,
                        result: item,
                        ...protocol,
                        ...getContext(clone.dataset.context)
                    });
                }
            }
            if (bang === "static") {
                node.static = true;
            }
        }
        for (let [bang, code] of Object.entries(bangs)) {
            console.log("bang", bang);
            if (bang === "load") {
                if (node.loaded) {
                    console.log(":static node", node);
                    continue;
                }
                node.loaded = true;

                console.log(`[${node.dataset.context}]`, ":load", code);

                for (let clone of (node.clones || [])) {
                    clone.remove();
                }

                node.clones = [];

                (async () => {
                    node.dispatchEvent(new CustomEvent(":loading"));

                    // const clone = document.createElement("div");
                    const clone = node.cloneNode(true);
                    clone.hidden = false;
                    delete clone.dataset.bangs;

                    // loading
                    clone.style.transition = "opacity 1s";
                    clone.style.opacity = 0;
                    clone.innerHTML = `<span><i class="fas fa-spinner fa-spin"></i></span>`;

                    if (bangs.start) proc(bangs.start, clone);

                    const html = await get(code);

                    if (typeof html !== "string") {
                        html = `<code class="text-red-500">view <strong>${code}</strong></code>`;
                    }

                    const handler = bangs.main || null;

                    clone.innerHTML = html;
                    clone.hidden = false;
                    delete clone.dataset.bangs;

                    clone.dataset.context = `:${code}`;

                    node.insertAdjacentElement("beforebegin", clone);

                    node.clones.push(clone);

                    registry(clone, clone);

                    clone.setContext = (context, ...params) => {
                        return setContext(clone.dataset.context, {
                            ...getContext(clone.dataset.context),
                            ...(context || {})
                        }, ...params);
                    };

                    clone.getContext = (...params) => {
                        return getContext(clone.dataset.context, ...params);
                    };

                    if (bangs.before) proc(bangs.before, clone);

                    for (let script of selectAll("script", clone)) {
                        if (script.src) {
                            window.scripts = window.scripts || {};
                            if (window.scripts[script.src]) continue;
                            window.scripts[script.src] = true;

                            const clone = document.createElement("script");
                            await new Promise(resolve => {
                                clone.addEventListener("load", () => {
                                    resolve();
                                });
                                clone.src = script.src;
                                document.body.append(clone);
                            })
                            console.log(`[pulpo.js] add library`, script.src);
                            continue;
                        }

                        await new Function(
                            "document",
                            "script",
                            "parent",
                            "root",
                            "source",
                            "handle",
                            "namespace",
                            "context",
                            "setContext",
                            "setGlobalContext",
                            "getContext",
                            "getGlobalContext",
                            `(async () => {
                                    ${script.textContent}
                                })()`
                        )(
                            document,
                            script,
                            clone,
                            clone.firstElementChild,
                            node,
                            handle,
                            clone.dataset.context,
                            getContext(clone.dataset.context),
                            clone.setContext,
                            (namespace, protocol, ...params) => {
                                setContext(namespace, {
                                    ...getContext(namespace),
                                    ...protocol
                                }, ...params)
                            },
                            clone.getContext,
                            getContext,
                        );
                    }

                    if (handler) proc(handler, clone);

                    if (bangs.end) proc(bangs.end, clone);

                    // loaded
                    await sleep(0.1);
                    clone.style.opacity = 1;

                    // setContext(clone.dataset.context, {
                    //     handler,
                    //     ...protocol,
                    //     ...getContext(clone.dataset.context)
                    // });
                })();
            }
        }

        for (let [watcher, code] of Object.entries(JSON.parse(node.dataset?.watchers || "{}"))) {
            node[watcher] = proc(code, node);
        }
    }
}

function getContext(name) {
    window.context = window.context || {};
    return window.context[name || "any"] || {};
}

function handle(name, callback) {
    window.handlers = window.handlers || {};
    window.handlers[name] = callback;
}

function initialize(root = document.body) {
    root.style.opacity = 0;
    root.style.transition = "opacity 600ms";

    registry(root);

    root.hidden = false;

    setTimeout(() => {
        root.style.opacity = 1;
    });
}

async function get(url, params = {}, handler = undefined) {
    const body = {
        ...(window.globalPost || {}),
        ...(params || {})
    };

    const query = Object.entries(body).map(([key, value]) => `${key}=${value}`).join("&");

    const response = await fetch(`${url}${query ? `?${query}` : ""}`, handler);

    if (!response.ok) {
        const error = await response.text();
        return { error };
    }

    return await response.text();
}

async function post(url, body = {}, options = {}, handler = null) {
    const protocol = {
        ...(window.globalPost || {}),
        ...(body || {})
    };

    const response = await fetch(url, handler || {
        method: "post",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(protocol),
        ...options
    });

    if (!response.ok) {
        const error = await response.text();
        return { error };
    }

    return await response.json();
}

function handler(name) {
    const handlers = window.handlers || {};
    return handlers[name] || ((...params) => console.warn(`pulpo.js: invalid handler ${name}`, params))
}

function fire(name, ...params) {
    return handler(name)(...params);
}

function setToken(token) {
    window.globalPost = {
        ...(window.globalPost || {}),
        token
    };
}

async function sleep(time = 1) {
    await new Promise(resolve => setTimeout(resolve, time * 1000));
}

function getParams() {
    const hash = window.location.hash || "#";
    const query = hash.replace(/^[^#]*#/, "");
    const params = query.split("&").map(chain => (
        (chain.match(/^([^=]*)=(.*)/) || []).slice(1)
    )).reduce((params, [key, value]) => ({
        ...params,
        [key]: value
    }), {});
    return params;
}

function getParam(key) {
    return getParams()[key] || null;
}