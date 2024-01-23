(ns wield.macros
  (:require [sci.core :as sci]
            [sci.impl.vars :as vars]))

(defmacro def-api [bindings]
  (let [b (->> bindings
               (map (fn [[k v]]
                      [k {:fun v
                          :dyn-sym (symbol (str "w-" (name k)))}])))]
    `(do ~@(map (fn [[k {:keys [dyn-sym]}]]
                  `(def ~dyn-sym (sci/new-dynamic-var '~k nil)))
                b)
         (def ~'api-bindings ~(into {} (map (fn [[k v]] [(:dyn-sym v) (:fun v)]) b))))))

(defmacro bind-api [callbacks & body]
  `(let [~'b (update-vals ~'api-bindings (fn [~'v] (~'v ~callbacks)))]
    (vars/push-thread-bindings ~'b)
    (try (do ~@body)
         (finally (vars/pop-thread-bindings)))))

;(def api-bindings {'code #("renderCode") 'html #("renderHTML")})

;(clojure.pprint/pprint (macroexpand '(def-api {code #("renderCode") html #("renderHTML")})))
;(clojure.pprint/pprint (macroexpand '(bind-api "Callback" "Body")))
;(clojure.pprint/pprint 
  ;(macroexpand
    ;'(def-api [code #(.-onRenderCode ^js/Object %)
               ;text #(.-onRenderText ^js/Object %)
               ;md #(.-onRenderMarkdown ^js/Object %)
               ;html #(.-onRenderHTML ^js/Object %)
               ;reagent (fn [callbacks] (fn [app container-el] (.onRenderReagent ^js/Object callbacks app)))
               ;set-interval #(.-onSetInterval ^js/Object %)
               ;chart (fn [callbacks] #(.onChart ^js/Object callbacks (clj->js %)))
               ;current #(.-current ^js/Object %)])))
