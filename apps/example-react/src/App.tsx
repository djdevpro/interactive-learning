import { validateGuide } from '@interactive-learning/player';
import { InteractiveGuide } from '@interactive-learning/player/react';
import rawGuide from '../../example/public/example/guide.json';

const guide = validateGuide(rawGuide);

export default function App() {
  return <InteractiveGuide guide={guide} />;
}
