import * as sci from "lib/sci"
import { CodeBlockEvaluation } from "./evaluator"
import ObsidianClojure from "./main"

const RESULTS_WRAPPER_CLASS = 'eval-results'
const INLINE_CODE_ELEMENT_SOURCE_ATTRIBUTE_NAME = 'data-clojure-source'

function formatDollar(amount: number) {
  return amount % 1 === 0 ? `$${amount.toLocaleString()}` : `$${amount.toFixed(2).toLocaleString()}`;
}

function formatPercentage(value: number) {
  const percentage = value * 100;
  if (percentage % 1 === 0) {
      return `${percentage}%`;
  } else if (Math.round(percentage * 10) % 10 === 0) {
      return `${percentage.toFixed(1)}%`;
  } else {
      return `${percentage.toFixed(2)}%`;
  }
}

export class ElementsManager {

  private plugin: ObsidianClojure

  constructor(plugin: ObsidianClojure) {
    this.plugin = plugin
  }

  public renderCode(sectionElement: HTMLElement, evaluation: CodeBlockEvaluation) {
    // Expects only one code block at a time.
    // console.log(sectionElement)
    // console.log(sectionElement.innerHTML)
    const codeElement = sectionElement.querySelector('code')
    // console.log(codeElement)
    const parentElement = codeElement.parentElement.parentElement;

    // Might have existing wrapper we need to remove first
    const possibleResults = parentElement.querySelector(`.${RESULTS_WRAPPER_CLASS}`)
    if (possibleResults) {
      parentElement.removeChild(possibleResults)
    }

    const isSpecialRender = evaluation.renderFunction != null
    const $resultsWrapper = isSpecialRender ? document.createElement('div') : document.createElement('pre')
    const $results = isSpecialRender ? document.createElement('div') : document.createElement('code')
    $resultsWrapper.addClass(RESULTS_WRAPPER_CLASS)

    if (evaluation.isError) {
      $resultsWrapper.style.backgroundColor = 'red'
      $resultsWrapper.style.color = 'white'
      $results.style.backgroundColor = 'red'
      $results.style.color = 'white'
      $results.innerText = "ERROR: " + evaluation.output
    } else {
      if (isSpecialRender) {
        evaluation.renderFunction($results)
      } else {
        // TODO This could be a render function
        $results.innerText = "=> " + sci.ppStr(evaluation.output)
      }
    }

    $resultsWrapper.appendChild($results)
    parentElement.appendChild($resultsWrapper)

    const renderProp = evaluation.codeBlock.props?.render
    if (renderProp === 'none') {
      sectionElement.style.display = 'none'
    } else if (renderProp === 'code') {
      $resultsWrapper.style.display = 'none'
    } else if (renderProp === 'results') {
      codeElement.parentElement.style.display = 'none'
    }
  }

  public renderInlineCode(sectionElement: HTMLElement, evaluation: CodeBlockEvaluation) {
    const codeElements = this.getCodeElements(sectionElement, evaluation.clojureInline)
    const codeElement = codeElements[evaluation.sectionIndex]

    codeElement.setAttribute(INLINE_CODE_ELEMENT_SOURCE_ATTRIBUTE_NAME, evaluation.codeBlock.source)

    codeElement.innerText = evaluation.output;
  }

  public hasCodeDescendants(container: HTMLElement, clojureInline: boolean): boolean {
    for (const codeElement of container.querySelectorAll('code')) {
      if (this.isCode(codeElement, clojureInline)) return true
    }
    return false
  }

  private getCodeElements(containerEl: HTMLElement, clojureInline: boolean): HTMLElement[] {
    const codeElements = containerEl.querySelectorAll('code')
    const clojureCodeElements: HTMLElement[] = []
    codeElements.forEach((el) => {
      if (this.isCode(el, clojureInline)) {
        clojureCodeElements.push(el)
      }
    })
    return clojureCodeElements
  }

  private isCode(codeElement: HTMLElement, clojureInline: boolean): boolean {
    // Rendered inline code--we recognize it with the help of a special attribute.
    if (codeElement.hasAttribute(INLINE_CODE_ELEMENT_SOURCE_ATTRIBUTE_NAME)) return true

    // Code blocks.
    const classList = codeElement.classList
    const languageClass = 'language-' + this.plugin.settings.blockLanguage
    if (classList.value.contains('language-')) return classList.contains(languageClass)

    // Unrendered inline code--rendering replaces the inner text with the code output.
    return clojureInline || codeElement.innerText[0] === '(' && codeElement.innerText.slice(-1) === ')'
  }
}
