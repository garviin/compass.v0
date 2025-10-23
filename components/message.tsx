'use client'

import { useEffect, useState } from 'react'

import rehypeExternalLinks from 'rehype-external-links'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

import { CodeBlock } from './ui/codeblock'
import { MemoizedReactMarkdown } from './ui/markdown'
import { Citing } from './custom-link'

// Lazy load KaTeX only when needed
let katexCSSLoaded = false
const loadKatexCSS = () => {
  if (katexCSSLoaded || typeof document === 'undefined') return
  katexCSSLoaded = true
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'
  link.integrity =
    'sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV'
  link.crossOrigin = 'anonymous'
  document.head.appendChild(link)
}

// Lazy load rehype-katex and remark-math
const loadKatexPlugins = async () => {
  const [rehypeKatex, remarkMath] = await Promise.all([
    import('rehype-katex'),
    import('remark-math')
  ])
  return {
    rehypeKatex: rehypeKatex.default,
    remarkMath: remarkMath.default
  }
}

export function BotMessage({
  message,
  className
}: {
  message: string
  className?: string
}) {
  // Check if the content contains LaTeX patterns
  const containsLaTeX = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/.test(
    message || ''
  )

  const [katexPlugins, setKatexPlugins] = useState<{
    rehypeKatex: any
    remarkMath: any
  } | null>(null)

  // Load KaTeX plugins only when needed
  useEffect(() => {
    if (containsLaTeX && !katexPlugins) {
      loadKatexCSS()
      loadKatexPlugins().then(setKatexPlugins)
    }
  }, [containsLaTeX, katexPlugins])

  // Modify the content to render LaTeX equations if LaTeX patterns are found
  const processedData = preprocessLaTeX(message || '')

  // Common component overrides
  const markdownComponents = {
    code({ node, inline, className, children, ...props }: any) {
      if (children.length) {
        if (children[0] == '▍') {
          return <span className="mt-1 cursor-default animate-pulse">▍</span>
        }

        children[0] = (children[0] as string).replace('`▍`', '▍')
      }

      const match = /language-(\w+)/.exec(className || '')

      if (inline) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        )
      }

      return (
        <CodeBlock
          key={Math.random()}
          language={(match && match[1]) || ''}
          value={String(children).replace(/\n$/, '')}
          {...props}
        />
      )
    },
    a: Citing
  }

  if (containsLaTeX && katexPlugins) {
    return (
      <MemoizedReactMarkdown
        rehypePlugins={[
          [rehypeExternalLinks, { target: '_blank' }],
          [katexPlugins.rehypeKatex]
        ]}
        remarkPlugins={[remarkGfm, katexPlugins.remarkMath]}
        className={cn(
          'prose-sm prose-neutral prose-a:text-accent-foreground/50',
          className
        )}
        components={markdownComponents}
      >
        {processedData}
      </MemoizedReactMarkdown>
    )
  }

  return (
    <MemoizedReactMarkdown
      rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
      remarkPlugins={[remarkGfm]}
      className={cn(
        'prose-sm prose-neutral prose-a:text-accent-foreground/50',
        className
      )}
      components={markdownComponents}
    >
      {message}
    </MemoizedReactMarkdown>
  )
}

// Preprocess LaTeX equations to be rendered by KaTeX
// ref: https://github.com/remarkjs/react-markdown/issues/785
const preprocessLaTeX = (content: string) => {
  const blockProcessedContent = content.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_, equation) => `$$${equation}$$`
  )
  const inlineProcessedContent = blockProcessedContent.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (_, equation) => `$${equation}$`
  )
  return inlineProcessedContent
}
