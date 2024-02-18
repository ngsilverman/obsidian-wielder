(ns sci.api
  (:require-macros [wield.macros :refer [def-api bind-api]])
  (:require
    [clojure.pprint :refer [pprint]]
    [sci.core :as sci]
    [sci.impl.vars]
    [reagent.core :as r]
    [reagent.dom :as rdom]
    [cljs.repl :as repl]
    [cljs.core :refer [clj->js]]
    [promesa.core]
    [cljc.java-time.local-date :as ld]
    [cljc.java-time.format.date-time-formatter :as dtf]))
    ;; [clojure.repl :as repl]))

;; TODO This is not working correctly...
(def doc ^:sci/macro
  (fn [_&form _&env x]
    (with-out-str
      (repl/doc x))))

(defn ^:export init [js-global o-bindings]
  (sci/init {:bindings {'hello "this is working"
                        'ratom r/atom
                        'doc doc}
              :classes {'js js-global
                        :allow :all}
              :namespaces {'dtf {'of-pattern dtf/of-pattern}
                           'ld {'format ld/format
                                'parse ld/parse
                                'plus-days ld/plus-days
                                'minus-days ld/minus-days}
                           'o (update-keys (js->clj o-bindings) symbol)
                           'p {'all promesa.core/all
                               'chain promesa.core/chain
                               'resolved promesa.core/resolved
                               'rejected promesa.core/rejected
                               'then (fn [p f] (promesa.core/then p (sci.impl.vars/binding-conveyor-fn f)))}}}))

(defn ^:export renderReagent [app container]
  (rdom/render app container))

(defn ^:export ppStr [t]
  (try
    (with-out-str (pprint t))
    (catch js/Error e t)))

(defn $ [price & _]
  (let [number-format #js {:style "currency" :currency "USD"}
        formatted-price (.format (js/Intl.NumberFormat. "en-US" number-format) price)
        regex #"\.00$|(\.\d)0$"]
    (clojure.string/replace formatted-price regex "$1")))

(def def$ ^:sci/macro
  (fn [_&form _&env name value]
    `(do (def ~name ~value)
         (user/$ ~value))))

(def def=$ ^:sci/macro
  (fn [_&form _&env name value]
    `(do (def ~name ~value)
         (str '~name " = " (user/$ ~value)))))

(defn % [float] 
  (str (.toFixed (* float 100) 2) "%"))

(def def% ^:sci/macro
  (fn [_&form _&env name value]
    `(do (def ~name ~value)
         (user/% ~value))))

(def def=% ^:sci/macro
  (fn [_&form _&env name value]
    `(do (def ~name ~value)
         (str '~name " = " (user/% ~value)))))

(def-api {code #(.-onRenderCode ^js/Object %)
          text #(.-onRenderText ^js/Object %)
          md #(.-onRenderMarkdown ^js/Object %)
          html #(.-onRenderHTML ^js/Object %)
          reagent (fn [callbacks] (fn [app container-el] (.onRenderReagent ^js/Object callbacks app)))
          set-interval #(.-onSetInterval ^js/Object %)
          chart (fn [callbacks] #(.onChart ^js/Object callbacks (clj->js %)))
          current #(.-current ^js/Object %)})

(defn ^:export evalString 
  [ctx 
   source 
   {:keys [onRenderHTML onRenderText onRenderCode onRenderReagent onSetInterval onChart] :as opts}]
  (bind-api opts
            (sci/eval-string*
              (sci/merge-opts ctx
                              {:namespaces {'user {'$ $
                                                   '% %
                                                   'def$ def$
                                                   'def=$ def=$
                                                   'def% def%
                                                   'def=% def=%}
                                            'w {'html w-html
                                                'text w-text
                                                'md w-md
                                                'code w-code
                                                'reagent w-reagent
                                                'set-interval w-set-interval
                                                'chart w-chart
                                                'current w-current}}})
              source)))

(comment
  (def ctx (init nil))
  (evalString
    ctx
    "(doc map)"
    {})
  (clojure.pprint/pprint ctx)
  (def ctx (assoc ctx :bindings {'hello "nah"}))
  (evalString
    ctx
    "*renderHTML"
    {:onRenderHTML (fn [] (println "rendering"))}))
