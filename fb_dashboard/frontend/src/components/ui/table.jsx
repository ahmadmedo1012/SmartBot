"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const TableContext = React.createContext({ striped: false })

const Table = React.forwardRef(({ className, striped = false, ...props }, ref) => (
  <TableContext.Provider value={{ striped }}>
    <div className="relative w-full overflow-auto rounded-xl border border-border/30 bg-card/25 backdrop-blur-sm">
      <table
        ref={ref}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props} />
    </div>
  </TableContext.Provider>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn("[&_tr]:border-b bg-muted/50 sticky top-0 z-10 backdrop-blur-sm", className)}
    {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef(({ className, ...props }, ref) => {
  const { striped } = React.useContext(TableContext)
  return (
    <tbody
      ref={ref}
      className={cn(
        striped && "[&_tr:nth-child(even)]:bg-muted/20",
        "[&_tr:last-child]:border-0",
        className
      )}
      {...props} />
  )
})
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props} />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-border/30 transition-colors duration-150 hover:bg-primary/5 data-[state=selected]:bg-muted",
      className
    )}
    {...props} />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-3 text-start align-middle font-semibold text-muted-foreground text-[11px] uppercase tracking-wider [&:has([role=checkbox])]:pe-0",
      className
    )}
    {...props} />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-2.5 px-3 align-middle text-sm [&:has([role=checkbox])]:pe-0", className)}
    {...props} />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props} />
))
TableCaption.displayName = "TableCaption"

export {
  Table, TableHeader, TableBody, TableFooter, TableHead,
  TableRow, TableCell, TableCaption,
}
