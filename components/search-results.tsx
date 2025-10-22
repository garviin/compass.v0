'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { SearchResultItem } from '@/lib/types'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

// Helper to get favicon URL
const getFaviconUrl = (url: string) => {
  try {
    const hostname = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
  } catch {
    return null
  }
}

// Helper to get domain display name
const getDomainName = (url: string) => {
  try {
    const hostname = new URL(url).hostname
    const parts = hostname.split('.')
    return parts.length > 2 ? parts.slice(1, -1).join('.') : parts[0]
  } catch {
    return 'Unknown'
  }
}

export interface SearchResultsProps {
  results: SearchResultItem[]
  displayMode?: 'grid' | 'list'
}

export function SearchResults({
  results,
  displayMode = 'grid'
}: SearchResultsProps) {
  // State to manage whether to display the results
  const [showAllResults, setShowAllResults] = useState(false)

  const handleViewMore = () => {
    setShowAllResults(true)
  }

  // Logic for grid mode
  const displayedGridResults = showAllResults ? results : results.slice(0, 3)
  const additionalResultsCount = results.length > 3 ? results.length - 3 : 0

  // --- List Mode Rendering ---
  if (displayMode === 'list') {
    return (
      <div className="flex flex-col gap-2">
        {results.map((result, index) => {
          const faviconUrl = getFaviconUrl(result.url)
          const hostname = new URL(result.url).hostname

          return (
            <Link
              href={result.url}
              key={`${result.url}-${index}`}
              passHref
              target="_blank"
              className="block"
            >
              <Card className="w-full hover:bg-muted/50 transition-colors">
                <CardContent className="p-2 flex items-start space-x-2">
                  <Avatar className="h-4 w-4 mt-1 flex-shrink-0">
                    {faviconUrl && (
                      <AvatarImage src={faviconUrl} alt={hostname} />
                    )}
                    <AvatarFallback className="text-xs">
                      {hostname[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-grow overflow-hidden space-y-0.5">
                    <p className="text-sm font-medium line-clamp-1">
                      {result.title || new URL(result.url).pathname}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {result.content}
                    </p>
                    <div className="text-xs text-muted-foreground/80 mt-1 truncate">
                      <span className="underline">{hostname}</span> - {index + 1}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    )
  }

  // --- Grid Mode Rendering ---
  return (
    <div className="flex flex-wrap -m-1">
      {displayedGridResults.map((result, index) => {
        const faviconUrl = getFaviconUrl(result.url)
        const domainName = getDomainName(result.url)
        const hostname = new URL(result.url).hostname

        return (
          <div className="w-1/2 md:w-1/4 p-1" key={`${result.url}-${index}`}>
            <Link href={result.url} passHref target="_blank">
              <Card className="flex-1 h-full hover:bg-muted/50 transition-colors">
                <CardContent className="p-2 flex flex-col justify-between h-full">
                  <p className="text-xs line-clamp-2 min-h-[2rem]">
                    {result.title || result.content}
                  </p>
                  <div className="mt-2 flex items-center space-x-1">
                    <Avatar className="h-4 w-4">
                      {faviconUrl && (
                        <AvatarImage src={faviconUrl} alt={hostname} />
                      )}
                      <AvatarFallback className="text-xs">
                        {hostname[0]?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-xs opacity-60 truncate">
                      {`${domainName} - ${index + 1}`}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        )
      })}
      {!showAllResults && additionalResultsCount > 0 && (
        <div className="w-1/2 md:w-1/4 p-1">
          <Card className="flex-1 flex h-full items-center justify-center">
            <CardContent className="p-2">
              <Button
                variant={'link'}
                className="text-muted-foreground"
                onClick={handleViewMore}
              >
                View {additionalResultsCount} more
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
