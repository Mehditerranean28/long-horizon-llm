"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Palette } from "lucide-react"

export type Theme =
  | "ultra-white"
  | "dark"
  | "theme-dune"
  | "theme-warhammer-ultramarines"
  | "theme-dracula"
  | "theme-tron"
  | "theme-dow"
  | "theme-matrix"
  | "theme-blade-runner"
  | "theme-wall-e"
  | "theme-wes-anderson"
  | "theme-evangelion"
  | "theme-westworld"
  | "theme-severance"
  | "theme-fringe"
  | "theme-helix"
  | "theme-chaos-marines"
  | "theme-high-contrast"
  | "theme-dyslexia"

const knownThemeClasses: Theme[] = [
  "dark",
  "theme-dune",
  "theme-dracula",
  "theme-warhammer-ultramarines",
  "theme-tron",
  "theme-dow",
  "theme-matrix",
  "theme-blade-runner",
  "theme-wall-e",
  "theme-wes-anderson",
  "theme-evangelion",
  "theme-westworld",
  "theme-severance",
  "theme-fringe",
  "theme-helix",
  "theme-chaos-marines",
  "theme-high-contrast",
  "theme-dyslexia",
]

interface Props {
  label: string
}

export default function ThemeSwitcher({ label }: Props) {
  const [currentTheme, setCurrentTheme] = useState<Theme>("ultra-white")

  const setTheme = useCallback((theme: Theme) => {
    setCurrentTheme(theme)
    if (typeof window !== "undefined") {
      localStorage.setItem("app-theme", theme)
      const htmlEl = document.documentElement
      htmlEl.classList.remove(...knownThemeClasses)
      if (theme !== "ultra-white") {
        htmlEl.classList.add(theme)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("app-theme") as Theme | null
      let initial: Theme = "ultra-white"
      if (savedTheme && (knownThemeClasses.includes(savedTheme) || savedTheme === "ultra-white")) {
        initial = savedTheme
      } else if (savedTheme) {
        localStorage.removeItem("app-theme")
      }
      setTheme(initial)
    }
  }, [setTheme])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="p-0 h-auto w-auto" title={label}>
          <Palette className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setTheme("ultra-white")}>Ultra White (Default)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-dracula")}>Dark Purple</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-dune")}>Dune</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-dow")}>DOW</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-warhammer-ultramarines")}>Warhammer Ultramarines</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-chaos-marines")}>Warhammer Chaos</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-matrix")}>Matrix</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-tron")}>Tron</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-blade-runner")}>Blade Runner</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-wall-e")}>WALL-E</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-wes-anderson")}>Wes Anderson</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-evangelion")}>Evangelion</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-westworld")}>Westworld</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-severance")}>Severance</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-fringe")}>Fringe</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-helix")}>Helix CDC</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("dark")}>Default Dark</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-high-contrast")}>High Contrast</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("theme-dyslexia")}>Dyslexia Friendly</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
