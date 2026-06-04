/** Example browser component - shows example objects before generation. */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ExampleObject {
  name: string;
  description: string;
  prompt: string;
  emoji?: string;
}

export interface ExampleCategory {
  name: string;
  emoji?: string;
  examples: ExampleObject[];
}

export const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  {
    name: "Desk Accessories",
    emoji: "🖇️",
    examples: [
      {
        name: "Phone Stand",
        description: "Angled stand for smartphones",
        prompt: "Create a phone stand with 70 degree angle, 80mm wide, 120mm tall",
        emoji: "📱",
      },
      {
        name: "Pen Holder",
        description: "Desktop pen and pencil organizer",
        prompt: "Create a square pen holder, 70x70mm base, 100mm tall, with rounded corners",
        emoji: "✏️",
      },
      {
        name: "Monitor Stand",
        description: "Screen riser with stable base",
        prompt: "Create a monitor stand, 300mm wide, 200mm deep, 100mm tall",
        emoji: "🖥️",
      },
      {
        name: "Desk Organizer",
        description: "Multi-compartment desktop organizer",
        prompt: "Create a desk organizer with thick walls, 150mm wide, 100mm deep, 120mm tall",
        emoji: "📦",
      },
    ],
  },
  {
    name: "Device Stands",
    emoji: "📲",
    examples: [
      {
        name: "Tablet Stand",
        description: "Sturdy stand for tablets",
        prompt: "Create a tablet stand with 65 degree angle, 200mm wide, 160mm tall, thick walls",
        emoji: "📖",
      },
      {
        name: "Laptop Stand",
        description: "Elevated stand for laptops",
        prompt: "Create a laptop stand, 280mm wide, 200mm deep, 200mm tall, with thick support",
        emoji: "💻",
      },
      {
        name: "AirPod Holder",
        description: "Compact holder for wireless earbuds",
        prompt: "Create a small AirPod holder, 60x50mm base, 40mm tall, thin walls",
        emoji: "🎧",
      },
      {
        name: "Watch Stand",
        description: "Display stand for smartwatch",
        prompt: "Create a watch stand with angled display, 70x70mm base, 50mm tall",
        emoji: "⌚",
      },
    ],
  },
  {
    name: "Storage & Organization",
    emoji: "📦",
    examples: [
      {
        name: "Cable Organizer",
        description: "Keep cables organized and tidy",
        prompt: "Create a cable organizer, 60x40mm base, 30mm tall, with slots",
        emoji: "🔌",
      },
      {
        name: "Business Card Holder",
        description: "Desktop card display",
        prompt: "Create a business card holder, 100x60mm base, 80mm tall with angled front",
        emoji: "💼",
      },
      {
        name: "Plant Pot Holder",
        description: "Decorative pot stand",
        prompt: "Create a plant pot holder, 130x130mm base, 140mm tall",
        emoji: "🌱",
      },
      {
        name: "Headphone Stand",
        description: "Vertical headphone display",
        prompt: "Create a vertical headphone stand, 120x120mm base, 200mm tall",
        emoji: "🎵",
      },
    ],
  },
];

export interface ExampleBrowserProps {
  onSelectExample: (example: ExampleObject) => void;
  isLoading?: boolean;
}

export default function ExampleBrowser({
  onSelectExample,
  isLoading = false,
}: ExampleBrowserProps) {
  const [activeCategory, setActiveCategory] = useState(0);
  const category = EXAMPLE_CATEGORIES[activeCategory];

  const handleNextCategory = () => {
    setActiveCategory((prev) => (prev + 1) % EXAMPLE_CATEGORIES.length);
  };

  const handlePreviousCategory = () => {
    setActiveCategory(
      (prev) => (prev - 1 + EXAMPLE_CATEGORIES.length) % EXAMPLE_CATEGORIES.length
    );
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Category header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{category.emoji || "📦"}</span>
          <h3 className="text-sm font-semibold text-cadio-text">{category.name}</h3>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handlePreviousCategory}
            disabled={isLoading}
            className="px-2 py-1 text-xs rounded bg-[#1a2535] text-cadio-muted hover:text-cadio-text hover:bg-[#243048] transition-all disabled:opacity-40"
            title="Previous category"
          >
            ← Prev
          </button>
          <button
            onClick={handleNextCategory}
            disabled={isLoading}
            className="px-2 py-1 text-xs rounded bg-[#1a2535] text-cadio-muted hover:text-cadio-text hover:bg-[#243048] transition-all disabled:opacity-40"
            title="Next category"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Examples grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCategory}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-2 gap-2"
        >
          {category.examples.map((example) => (
            <motion.button
              key={example.name}
              onClick={() => onSelectExample(example)}
              disabled={isLoading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="p-3 rounded-lg bg-[#1a2535] border border-[#2a3545] hover:border-cadio-accent hover:bg-[#243048] transition-all disabled:opacity-40 text-left"
            >
              <div className="flex items-start gap-2">
                <span className="text-lg">{example.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-cadio-text truncate">
                    {example.name}
                  </p>
                  <p className="text-xs text-cadio-muted line-clamp-2">
                    {example.description}
                  </p>
                </div>
              </div>
            </motion.button>
          ))}
        </motion.div>
      </AnimatePresence>

      {/* Category indicator */}
      <div className="flex gap-1 justify-center">
        {EXAMPLE_CATEGORIES.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all ${
              i === activeCategory
                ? "w-3 bg-cadio-accent"
                : "w-1.5 bg-[#2a3545]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
