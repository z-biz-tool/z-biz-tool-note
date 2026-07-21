import { useState, useEffect, useRef } from 'react';

interface EmojiEntry {
  char: string;
  name: string;
}

interface EmojiCategory {
  name: string;
  emojis: EmojiEntry[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    name: 'Smileys',
    emojis: [
      { char: '😀', name: 'grinning' },
      { char: '😃', name: 'smiley' },
      { char: '😄', name: 'smile' },
      { char: '😁', name: 'grin' },
      { char: '😆', name: 'laugh' },
      { char: '😅', name: 'sweat smile' },
      { char: '😂', name: 'joy' },
      { char: '🤣', name: 'rofl' },
      { char: '😊', name: 'blush' },
      { char: '😇', name: 'angel' },
      { char: '🙂', name: 'slight smile' },
      { char: '😉', name: 'wink' },
      { char: '😌', name: 'relieved' },
      { char: '😍', name: 'heart eyes' },
      { char: '🥰', name: 'love' },
      { char: '😘', name: 'kiss' },
      { char: '😋', name: 'yum' },
      { char: '😛', name: 'tongue' },
      { char: '😜', name: 'wink tongue' },
      { char: '🤔', name: 'think' },
    ],
  },
  {
    name: 'Gestures',
    emojis: [
      { char: '👋', name: 'wave' },
      { char: '👌', name: 'ok' },
      { char: '✌️', name: 'peace' },
      { char: '🤞', name: 'fingers crossed' },
      { char: '🤟', name: 'love you' },
      { char: '🤘', name: 'rock' },
      { char: '👈', name: 'point left' },
      { char: '👉', name: 'point right' },
      { char: '👆', name: 'point up' },
      { char: '👍', name: 'thumbs up' },
      { char: '👎', name: 'thumbs down' },
      { char: '✊', name: 'fist' },
      { char: '👊', name: 'punch' },
      { char: '👏', name: 'clap' },
      { char: '🙏', name: 'pray' },
    ],
  },
  {
    name: 'Animals',
    emojis: [
      { char: '🐶', name: 'dog' },
      { char: '🐱', name: 'cat' },
      { char: '🐭', name: 'mouse' },
      { char: '🐹', name: 'hamster' },
      { char: '🐰', name: 'rabbit' },
      { char: '🦊', name: 'fox' },
      { char: '🐻', name: 'bear' },
      { char: '🐼', name: 'panda' },
      { char: '🐨', name: 'koala' },
      { char: '🐯', name: 'tiger' },
      { char: '🦁', name: 'lion' },
      { char: '🐮', name: 'cow' },
      { char: '🐷', name: 'pig' },
      { char: '🐸', name: 'frog' },
      { char: '🐵', name: 'monkey' },
      { char: '🐔', name: 'chicken' },
      { char: '🐧', name: 'penguin' },
      { char: '🐦', name: 'bird' },
      { char: '🐝', name: 'bee' },
      { char: '🦋', name: 'butterfly' },
    ],
  },
  {
    name: 'Food',
    emojis: [
      { char: '🍎', name: 'apple' },
      { char: '🍐', name: 'pear' },
      { char: '🍊', name: 'orange' },
      { char: '🍋', name: 'lemon' },
      { char: '🍌', name: 'banana' },
      { char: '🍉', name: 'watermelon' },
      { char: '🍇', name: 'grapes' },
      { char: '🍓', name: 'strawberry' },
      { char: '🍒', name: 'cherry' },
      { char: '🍑', name: 'peach' },
      { char: '🥭', name: 'mango' },
      { char: '🍍', name: 'pineapple' },
      { char: '🥥', name: 'coconut' },
      { char: '🥝', name: 'kiwi' },
      { char: '🍅', name: 'tomato' },
      { char: '🥑', name: 'avocado' },
      { char: '🍔', name: 'burger' },
      { char: '🍕', name: 'pizza' },
      { char: '🌮', name: 'taco' },
      { char: '🍰', name: 'cake' },
    ],
  },
  {
    name: 'Activities',
    emojis: [
      { char: '⚽', name: 'soccer' },
      { char: '🏀', name: 'basketball' },
      { char: '🏈', name: 'football' },
      { char: '⚾', name: 'baseball' },
      { char: '🎾', name: 'tennis' },
      { char: '🏐', name: 'volleyball' },
      { char: '🏓', name: 'ping pong' },
      { char: '🏒', name: 'hockey' },
      { char: '⛳', name: 'golf' },
      { char: '🎯', name: 'dart' },
      { char: '🎮', name: 'game' },
      { char: '🎲', name: 'dice' },
      { char: '🎸', name: 'guitar' },
      { char: '🎹', name: 'piano' },
      { char: '🏆', name: 'trophy' },
    ],
  },
  {
    name: 'Travel',
    emojis: [
      { char: '🚗', name: 'car' },
      { char: '🚕', name: 'taxi' },
      { char: '🚌', name: 'bus' },
      { char: '🚑', name: 'ambulance' },
      { char: '🚒', name: 'fire truck' },
      { char: '🚓', name: 'police car' },
      { char: '🚜', name: 'tractor' },
      { char: '🚲', name: 'bike' },
      { char: '🛵', name: 'scooter' },
      { char: '🏍', name: 'motorcycle' },
      { char: '✈️', name: 'plane' },
      { char: '🚀', name: 'rocket' },
      { char: '🚁', name: 'helicopter' },
      { char: '⛵', name: 'boat' },
      { char: '🚢', name: 'ship' },
    ],
  },
  {
    name: 'Objects',
    emojis: [
      { char: '⌚', name: 'watch' },
      { char: '📱', name: 'phone' },
      { char: '💻', name: 'laptop' },
      { char: '⌨️', name: 'keyboard' },
      { char: '🖥', name: 'monitor' },
      { char: '🖨', name: 'printer' },
      { char: '🖱', name: 'mouse' },
      { char: '📷', name: 'camera' },
      { char: '📺', name: 'tv' },
      { char: '⏰', name: 'alarm clock' },
      { char: '💡', name: 'bulb' },
      { char: '🔋', name: 'battery' },
      { char: '🔌', name: 'plug' },
      { char: '🔔', name: 'bell' },
      { char: '🔑', name: 'key' },
    ],
  },
  {
    name: 'Symbols',
    emojis: [
      { char: '❤️', name: 'red heart' },
      { char: '🧡', name: 'orange heart' },
      { char: '💛', name: 'yellow heart' },
      { char: '💚', name: 'green heart' },
      { char: '💙', name: 'blue heart' },
      { char: '💜', name: 'purple heart' },
      { char: '🖤', name: 'black heart' },
      { char: '💔', name: 'broken heart' },
      { char: '✨', name: 'sparkles' },
      { char: '⭐', name: 'star' },
      { char: '🌟', name: 'glowing star' },
      { char: '💯', name: 'hundred' },
      { char: '🔥', name: 'fire' },
      { char: '💧', name: 'droplet' },
      { char: '🌈', name: 'rainbow' },
    ],
  },
  {
    name: 'Flags',
    emojis: [
      { char: '🏁', name: 'checkered flag' },
      { char: '🚩', name: 'flag' },
      { char: '🎌', name: 'japanese flag' },
      { char: '🏴', name: 'black flag' },
      { char: '🏳️', name: 'white flag' },
      { char: '🇺🇸', name: 'usa flag' },
      { char: '🇬🇧', name: 'uk flag' },
      { char: '🇨🇳', name: 'china flag' },
      { char: '🇯🇵', name: 'japan flag' },
      { char: '🇩🇪', name: 'germany flag' },
    ],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export const EmojiPicker = ({ onSelect, onClose }: EmojiPickerProps) => {
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const allEmojis = EMOJI_CATEGORIES.flatMap((cat) => cat.emojis);
  const filtered = search
    ? allEmojis.filter((e) => e.name.includes(search.toLowerCase()))
    : allEmojis;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="emoji-picker" ref={containerRef}>
      <div className="emoji-picker-header">
        <input
          ref={searchInputRef}
          className="emoji-picker-search"
          type="text"
          placeholder="Search emoji..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="emoji-picker-grid">
        {filtered.map((emoji, i) => (
          <button
            key={`${emoji.char}-${i}`}
            className="emoji-picker-item"
            onClick={() => {
              onSelect(emoji.char);
              onClose();
            }}
            title={emoji.name}
          >
            {emoji.char}
          </button>
        ))}
      </div>
    </div>
  );
};
