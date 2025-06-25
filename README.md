# Geometric Pattern Generator

A web-based tool for creating customizable geometric patterns with line textures and colors. Each pattern is reproducible using a seed system.

**[Live Demo](https://pxl-pshr.github.io/geometric-pattern-generator/)**

![Pattern Generator Preview](https://i.postimg.cc/m22DyR4q/download-7.png)

## Features

- **Infinite Unique Patterns** - Generate endless variations of geometric designs
- **Seed System** - Save and share patterns using 8-character codes
- **Transparent Backgrounds** - Toggle transparency for versatile use cases
- **High-Quality Export** - Download patterns as PNG files
- **Responsive Design** - Works seamlessly on desktop and mobile
- **7 Pattern Styles** - Diagonal, horizontal, vertical, crosshatch, dots, waves, and circles
- **7 Color Palettes** - Sunset, Ocean, Neon, Pastel, Forest, Fire, and Cyberpunk themes

## Quick Start

1. Visit [the generator](https://pxl-pshr.github.io/geometric-pattern-generator/)
2. Press **SPACE** or click **"Generate New Pattern"** to create a new design
3. Copy the seed code to save your favorite patterns
4. Toggle transparency for backgrounds without color
5. Click **"Save Image"** to download your creation

### Pattern Generation Algorithm

1. Generates 8-15 overlapping shapes per pattern
2. Each shape has randomized:
   - Position, size, and rotation
   - Two-color gradient
   - Line pattern and spacing
   - Stroke weight
3. Shapes are layered by size (largest first)
4. Clipping masks contain patterns within bounds

## Seed

Each pattern has a unique 8-character alphanumeric seed (e.g., `A7bX9mK2`). This seed determines:
- Color palette selection
- Number and properties of shapes
- All random parameters

Seeds ensure that patterns can be perfectly recreated across different devices and sessions.


## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Gallery

Share your Gens: `#geogen`

---

Made by [pxl-pshr](https://github.com/pxl-pshr)