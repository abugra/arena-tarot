# Are.na Tarot

A mystical digital tarot reading experience using content from Are.na channels. Draw three cards and find your digital fortune!

## Features

- Draw three random cards from your Are.na channel
- Beautiful card flip animations
- Responsive design
- Past, Present, Future reading layout
- Support for images, text, and links from Are.na

## Setup

1. Create a channel on Are.na and add your content (images, text, links)
2. Update the `CHANNEL_SLUG` in `script.js` with your channel's slug
3. Host the files on a web server or run locally

## Usage

1. Click "Draw Cards" to get your reading
2. Click on each card to flip it and reveal its content
3. Use "Reset" to clear the reading and start over

## Technical Details

- Built with vanilla JavaScript, HTML, and CSS
- Uses the Are.na API v2
- No external dependencies
- Responsive design for all screen sizes

## Customization

You can customize the appearance by modifying the CSS variables in `styles.css`:

```css
:root {
    --primary-color: #2c3e50;
    --secondary-color: #34495e;
    --accent-color: #c0392b;
    --text-color: #ecf0f1;
    --card-bg: #2c3e50;
    --card-border: #c0392b;
}
```

## License

MIT License 