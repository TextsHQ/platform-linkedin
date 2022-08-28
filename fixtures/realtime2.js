define("ember-cli-realtime/services/realtime-api", ["exports", "@babel/runtime/helpers/esm/objectSpread2", "ember", "@ember/application", "@ember/array", "@ember/debug", "@ember/object", "@ember/object/computed", "@ember/object/evented", "@ember/runloop", "@ember/service", "@ember/utils", "ember-cli-realtime/utils/eventsource-polyfill", "ember-cli-realtime/utils/realtime-api-request", "ember-lifeline", "ember-stdlib/utils/is-browser", "restli-utils", "rsvp", "urn-utils"], (function(e, t, n, i, o, r, a, s, l, c, d, u, p, m, h, g, f, b, _) {
    "use strict"
    Object.defineProperty(e, "__esModule", {
        value: !0
    })
    e.default = void 0
    const y = e=>5 === Math.floor(e / 100)
    var v = d.default.extend({
        lix: (0, a.computed)({
            get() {
                return (0, i.getOwner)(this).lookup("service:lix")
            }
        }),
        jet: (0, a.computed)({
            get() {
                return (0, i.getOwner)(this).lookup("service:jet")
            }
        }),
        tracking: (0, a.computed)({
            get() {
                return (0, i.getOwner)(this).lookup("service:tracking")
            }
        }),
        domain: "https://realtime.www.linkedin.com",
        okToConnect: !0,
        realtimeSessionId: null,
        mpName: null,
        mpVersion: null,
        clientId: null,
        realtimeHeartbeatInterval: 0,
        _serverClockTimeDiff: void 0,
        _lastTimeClockSynced: 0,
        init() {
            this._super(...arguments)
            this.recipeMap = null
            this.recipeAccept = null
            this.accept = null
            this._personalTopicTypes = []
            this._recentServerClockTimeDiffs = []
            this.resetAcceptableErrorCount = this.get("lix").getTreatmentIsEnabled("voyager.web.messaging-realtime-acceptable-error-count")
            this.okToConnect && this.startRealtimeConnectivityTrackingSession(!0, !0)
            this.beforeUnloadHandler = ()=>{
                this.okToConnect && this.sendClientConnectivityHeartbeat(!0)
            }
            if (g.default) {
                (0,
                h.addEventListener)(this, window, "beforeunload", this.beforeUnloadHandler);
                (0,
                h.addEventListener)(this, window, "offline", this.endRealtimeConnectivityTrackingSession.bind(this));
                (0,
                h.addEventListener)(this, window, "online", this.startRealtimeConnectivityTrackingSession.bind(this))
            }
        },
        hasActiveConnection: (0, s.bool)("_clientConnectionId").readOnly(),
        activeSubscriptions: (0, a.computed)((()=>new Map)),
        _eventSource: void 0,
        _clientConnectionId: void 0,
        _consecutiveErrorCount: 0,
        _requestHeaders: (0, a.computed)("additionalRequestHeaders", (function() {
            let e = {
                "X-RestLi-Protocol-Version": "2.0.0"
            }
              , n = g.default && document.cookie.match(/JSESSIONID="?([^";]+)"?/)
            n = n && n[1]
            n && (e["Csrf-Token"] = n)
            return (0, t.default)((0, t.default)({}, e), this.get("additionalRequestHeaders"))
        }
        )),
        _connectRequestHeaders: (0, a.computed)("_requestHeaders", "realtimeSessionId", (function() {
            let e = {}
            null !== this.get("recipeMap") && (e["x-li-recipe-map"] = JSON.stringify(this.get("recipeMap")))
            null !== this.get("recipeAccept") && (e["x-li-recipe-accept"] = this.get("recipeAccept"))
            null !== this.get("accept") && (e["x-li-accept"] = this.get("accept"))
            null !== this.get("realtimeSessionId") && (e["x-li-realtime-session"] = this.get("realtimeSessionId"))
            return (0,
            t.default)((0,
            t.default)({}, e), this.get("_requestHeaders"))
        }
        )),
        getEventSource() {
            return new (0, p.EventSource)(...arguments)
        },
        reconnectAPI() {
            let {urlQueryParams: e=""} = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {}
            this.disconnectAPI()
            this.connectAPI(e)
        },
        connectAPI() {
            let e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : ""
              , t = this.get("_eventSource")
            if (t) {
                const e = this.get("_clientConnectionId")
                return e ? (0,
                b.resolve)(e) : new b.Promise((e=>{
                    t.addEventListener("receivedClientConnectionId", (t=>{
                        e(t.detail)
                    }
                    ))
                }
                ))
            }
            this.okToConnect && this.startRealtimeConnectivityTrackingSession(!1)
            t = this.getEventSource(m.default.rtfeMethods.connect(this.get("domain")).url + e, this.get("_connectRequestHeaders"), this.get("jet"))
            this.set("_eventSource", t)
            this.okToConnect && t.poll()
            return new b.Promise(((e,n)=>{
                t.addEventListener("receivedClientConnectionId", (t=>{
                    e(t.detail)
                }
                ))
                t.addEventListener("message", this.handleMessage.bind(this))
                t.addEventListener("open", (t=>{
                    this._consecutiveErrorCount = 0
                    this.notifySubscribers(!1, "connectionReestablished")
                    this.lastHeartBeatReceivedAt = Date.now()
                    e(t)
                }
                ))
                t.addEventListener("error", (e=>{
                    n()
                    this.handleError(e)
                }
                ))
            }
            ))
        },
        disconnectAPI() {
            const e = this.get("_eventSource")
            if (e) {
                e.close()
                this.setProperties({
                    _eventSource: void 0,
                    _clientConnectionId: void 0
                })
                return !0
            }
            return !1
        },
        getRetryDelay() {
            const e = 1e3
              , t = this.resetAcceptableErrorCount ? 0 : 2
              , n = this._consecutiveErrorCount - t
            if (n < 0)
                return 0
            const i = 2 * Math.random()
            return 1 === n ? (5 + i) * e : (10 + i) * e
        },
        handleError(e) {
            if (401 === e.status) {
                (0,
                a.set)(this, "okToConnect", !1)
                return this.disconnectAPI()
            }
            this._consecutiveErrorCount++
            const t = this.resetAcceptableErrorCount ? 0 : 2
            if (this._consecutiveErrorCount > t) {
                this.disconnectAPI();
                (0,
                c.cancel)(this.retryTask)
                this.retryTask = (0,
                c.later)(this, "connectAPI", this.getRetryDelay())
            }
        },
        startRealtimeConnectivityTrackingSession() {
            let e = !(arguments.length > 0 && void 0 !== arguments[0]) || arguments[0]
              , t = arguments.length > 1 && void 0 !== arguments[1] && arguments[1]
            this.get("realtimeSessionId") || this.set("realtimeSessionId", this.generateRealtimeSessionId())
            e && this.sendClientConnectivityHeartbeat(!1, t)
        },
        endRealtimeConnectivityTrackingSession() {
            (0,
            c.cancel)(this.nextRealtimeConnectivityHeartbeatTask)
            this.set("realtimeSessionId", null)
        },
        sendClientConnectivityHeartbeat() {
            let e = arguments.length > 0 && void 0 !== arguments[0] && arguments[0]
              , t = arguments.length > 1 && void 0 !== arguments[1] && arguments[1]
            const {clientId: i, realtimeSessionId: o, mpName: r, mpVersion: a} = this.getProperties("clientId", "realtimeSessionId", "mpName", "mpVersion")
              , s = null !== i ? [{
                clientId: i,
                realtimeSessionId: o,
                mpName: r,
                mpVersion: a,
                isLastHeartbeat: e,
                isFirstHeartbeat: t
            }] : [{
                realtimeSessionId: o,
                mpName: r,
                mpVersion: a,
                isLastHeartbeat: e
            }]
            o && r && a && m.default.makeRequest("connectivityHeartbeat", s, this.get("_requestHeaders"), this.get("domain")).catch((()=>{}
            ))
            if (!n.default.testing) {
                const e = 0 === this.realtimeHeartbeatInterval ? 6e5 : 1e3 * this.realtimeHeartbeatInterval
                this.nextRealtimeConnectivityHeartbeatTask = (0, c.later)(this, "sendClientConnectivityHeartbeat", e)
            }
        },
        syncRealtimeServerClockTime() {
            const e = Date.now()
            if (!(e - this._lastTimeClockSynced < p.RTFE_LIFETIME_DURATION_IN_MS - 2e4)) {
                this._lastTimeClockSynced = e
                return m.default.makeRequest("clockSync", [], this.get("_requestHeaders"), this.get("domain")).then((t=>{
                    let {timestamp: n} = t
                    const i = Date.now()
                    this._recentServerClockTimeDiffs = this._recentServerClockTimeDiffs.filter((e=>i - e.syncedAt < 36e5))
                    let o = i - e
                    0 === o && (o = 1)
                    this._recentServerClockTimeDiffs.push({
                        syncedAt: i,
                        clockDiff: n - (e + i) / 2,
                        weight: 1 / o
                    })
                    this._serverClockTimeDiff = this._computeWeightedAverageOfServerClockTimeDiff(this._recentServerClockTimeDiffs)
                }
                ))
            }
        },
        getServerClockTime() {
            return void 0 === this._serverClockTimeDiff ? -1 : Date.now() + this._serverClockTimeDiff
        },
        _computeWeightedAverageOfServerClockTimeDiff(e) {
            let t = 0
              , n = 0
            for (let i = 0; i < e.length; i++) {
                const {clockDiff: o, weight: r} = e[i]
                t += r * o
                n += r
            }
            return Math.round(t / n)
        },
        generateRealtimeSessionId() {
            throw new Error("generateRealtimeSessionId must be implemented in the child class implementation of realtime-api")
        },
        handleMessage(e) {
            const t = this.parseMessage(e)
            if (!t)
                return
            const {type: n, eventData: i} = t
            switch (n) {
            case m.default.types.clientConnection:
                this.set("_clientConnectionId", i.id)
                this._personalTopicTypes = i.personalTopics
                if (this.get("activeSubscriptions.size")) {
                    let e = []
                    this.get("activeSubscriptions").forEach(((t,n)=>e.push(n)))
                    e.length && this.apiSubscribe(e)
                }
                this.get("_eventSource").dispatchEvent(new p.CustomEvent("receivedClientConnectionId",{
                    detail: this.get("_clientConnectionId")
                }))
                this.syncRealtimeServerClockTime()
                break
            case m.default.types.heartbeat:
                this.handleHeartbeat()
                break
            default:
                {
                    const {topic: e, publisherTrackingId: t, trackingId: n, id: o} = i
                      , r = this.getServerClockTime()
                    this.get("tracking").fireTrackingPayload("RealtimeEventDeliveredEvent", {
                        publisherTrackingId: t,
                        realtimeEventId: o,
                        realtimeTrackingId: n,
                        topicUrn: e,
                        receivedTime: r
                    })
                    const a = Object.freeze(i)
                    this.notifySubscribers(e, "message", e, a)
                    break
                }
            }
        },
        handleHeartbeat() {
            const e = Date.now()
            if (this.lastHeartBeatReceivedAt) {
                const t = e - this.lastHeartBeatReceivedAt
                if (t > 3e4) {
                    t > 18e4 ? this.notifySubscribers(!1, "connectionReestablished", t) : this.notifySubscribers(!1, "shortConnectionReestablished", t)
                    this.notifySubscribers(!1, "poorRealtimeConnectionDetected")
                }
            }
            this.lastHeartBeatReceivedAt = e
        },
        isPersonalTopic(e) {
            let {type: t} = (0,
            _.extractEntityInfoFromUrn)(e)
            return -1 !== this._personalTopicTypes.indexOf(t)
        },
        notifySubscribers(e, t) {
            for (var n = arguments.length, i = new Array(n > 2 ? n - 2 : 0), o = 2; o < n; o++)
                i[o - 2] = arguments[o]
            const r = this.get("activeSubscriptions")
            let a
            if (e)
                a = r.get(e) || []
            else {
                a = []
                r.forEach((e=>{
                    a.push(...e)
                }
                ))
                a = a.filter(((e,t)=>a.indexOf(e) === t))
            }
            a.forEach((e=>{
                e.trigger(t, ...i)
            }
            ))
        },
        parseMessage(e) {
            try {
                const t = JSON.parse(e.data)
                  , n = Object.keys(t).shift()
                return {
                    type: n,
                    eventData: t[n]
                }
            } catch (e) {
                e.message = `Error parsing JSON in ember-cli-realtime (not common-time) | ${e.message}`
                this.get("jet").error(e, ["ember-cli-realtime", "invalid-json"], {
                    shouldRethrow: !1
                })
                return !1
            }
        },
        subscribe(e) {
            let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : []
              , n = this.get("activeSubscriptions")
            const i = (0,
            o.makeArray)(t).filter((t=>{
                let i = n.get(t)
                if (!i) {
                    n.set(t, (0,
                    o.A)([e]))
                    return !0
                }
                if (!i.includes(e)) {
                    i.pushObject(e)
                    return !1
                }
            }
            ))
            return this.get("_clientConnectionId") && i.length ? this.apiSubscribe(i) : this.connectAPI()
        },
        unsubscribe(e) {
            let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : []
              , n = this.get("activeSubscriptions")
            const i = (0,
            o.makeArray)(t).filter((t=>{
                let i = n.get(t)
                if (!i)
                    return !1
                i.removeObject(e)
                e.trigger("unsubscribe", t)
                if (!i.length) {
                    n.delete(t)
                    return !0
                }
                return !1
            }
            ))
            this.get("_clientConnectionId") && i.length && this.apiUnsubscribe(i).catch((()=>{}
            ))
            n.size || this.disconnectAPI()
        },
        willDestroy() {
            (0,
            c.cancel)(this.retryTask)
            this.endRealtimeConnectivityTrackingSession()
            this.disconnectAPI();
            (0,
            h.runDisposables)(this)
        },
        apiSubscribe(e) {
            if (!(e = e.filter((e=>!this.isPersonalTopic(e)))).length)
                return b.Promise.resolve()
            return this.tryAPISubscribe(e).then((e=>{
                const t = Object.keys(e.errors || {}).map((e=>f.default.decoder.decode(e).topic))
                t.length && t.forEach((e=>{
                    (this.get("activeSubscriptions").get(e) || []).forEach((t=>{
                        this.unsubscribe(t, e)
                        t.trigger("subscriptionFailed", e)
                    }
                    ))
                }
                ))
                return e
            }
            ))
        },
        tryAPISubscribe(e) {
            let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 0
            return m.default.makeRequest("batchSubscribe", [this.get("_clientConnectionId"), e], this.get("_requestHeaders"), this.get("domain")).then((e=>{
                const n = []
                Object.keys(e.errors || {}).forEach((t=>{
                    const {status: i} = e.errors[t]
                    400 === i ? this.get("jet").error(new Error("Bad request payload when subscribing to realtime topic"), [`connection ID and topic: ${t}`], {
                        shouldRethrow: !1
                    }) : y(i) && n.push(t)
                }
                ))
                if (n.length && t < 2) {
                    n.forEach((t=>delete e.errors[t]))
                    const i = n.map((e=>f.default.decoder.decode(e).topic))
                    return this.tryAPISubscribe(i, t + 1).then((t=>m.default.mergePayloads(e, t)))
                }
                return e
            }
            )).catch((n=>{
                let {status: i} = n
                if (412 === i) {
                    this.reconnectAPI()
                    return (0,
                    b.resolve)({})
                }
                if (y(i) && t < 2)
                    return this.tryAPISubscribe(e, t + 1)
                throw i
            }
            ))
        },
        apiUnsubscribe(e) {
            if (!(e = e.filter((e=>!this.isPersonalTopic(e)))).length)
                return Promise.resolve()
            const t = this.get("_requestHeaders")
            return m.default.makeRequest("batchUnsubscribe", [this.get("_clientConnectionId"), e], t, this.get("domain")).catch((t=>{
                let {status: n} = t
                if (412 === n) {
                    this.reconnectAPI()
                    return (0,
                    b.resolve)({})
                }
                if (0 === n)
                    return (0,
                    b.resolve)({})
                {
                    const t = ["info", "realtime-unsubscribe-failed", `status: ${n}`, `realtime connection ID: ${this.get("_clientConnectionId")}`, `topics: ${e.join(",")}`]
                    this.get("jet").logError(new Error("Failed to unsubscribe to realtime"), t)
                }
                throw n
            }
            ))
        }
    })
    e.default = v
}
))
