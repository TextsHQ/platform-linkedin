define("ember-cli-realtime/utils/realtime-api-request", ["exports", "@ember/debug", "@ember/polyfills", "restli-utils", "rsvp"], (function(e, t, n, i, o) {
    "use strict"
    Object.defineProperty(e, "__esModule", {
        value: !0
    })
    e.default = e.NAMESPACE = void 0
    const r = "/realtime"
    e.NAMESPACE = r
    var a = {
        rtfeMethods: {
            connect() {
                return {
                    method: "GET",
                    url: `${arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : ""}/realtime/connect`
                }
            },
            batchSubscribe(e, t) {
                const n = t.map((t=>({
                    clientConnectionId: e,
                    topic: t
                })))
                  , o = {}
                  , r = {
                    entities: n.reduce(((e,t)=>{
                        e[i.default.encoder.encode(t)] = o
                        return e
                    }
                    ), {})
                }
                return {
                    method: "PUT",
                    url: `/realtime/realtimeFrontendSubscriptions?${i.default.encoder.paramEncode({
                        ids: n
                    })}`,
                    body: r
                }
            },
            batchUnsubscribe(e, t) {
                return (0,
                n.assign)(this.batchSubscribe(e, t), {
                    method: "DELETE"
                })
            },
            connectivityHeartbeat: e=>({
                method: "POST",
                url: "/realtime/realtimeFrontendClientConnectivityTracking?action=sendHeartbeat",
                body: e
            }),
            clockSync: ()=>({
                method: "GET",
                url: "/realtime/realtimeFrontendTimestamp"
            })
        },
        types: {
            clientConnection: "com.linkedin.realtimefrontend.ClientConnection",
            heartbeat: "com.linkedin.realtimefrontend.Heartbeat"
        },
        makeRequest(e) {
            let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : []
              , n = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {}
              , r = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : ""
              , a = this.rtfeMethods[e](...t)
            a.headers = n
            a.body && (a.body = JSON.stringify(a.body))
            if (a.url.length > 1e3) {
                a.forceQueryTunnel = !0
                a = i.default.queryTunnel.encodeRequest(a)
            }
            a.url = `${r}${a.url}`
            return new o.Promise(((e,t)=>{
                const n = new XMLHttpRequest
                n.open(a.method, a.url)
                n.withCredentials = !0
                Object.keys(a.headers).forEach((e=>n.setRequestHeader(e, a.headers[e])))
                n.onerror = e=>{
                    t({
                        status: n.status,
                        message: e && e.message
                    })
                }
                n.onload = ()=>{
                    const {status: i} = n
                    if (i >= 200 && i < 300)
                        try {
                            e(JSON.parse(n.responseText))
                        } catch (e) {
                            t({
                                status: i,
                                message: "Realtime: Invalid JSON in API reponse"
                            })
                        }
                    else
                        t({
                            status: i,
                            message: "Realtime: API Server Error"
                        })
                }
                n.send(a.body)
            }
            ))
        },
        mergePayloads(e, t) {
            (0,
            n.assign)(e.results, t.results);
            (0,
            n.assign)(e.errors, t.errors)
            return e
        }
    }
    e.default = a
}
))
