import '@interactive-learning/player/auto';
import { validateGuide } from '@interactive-learning/player';
import rawGuide from '../../example/public/example/guide.json';

const guide = validateGuide(rawGuide);

export default function App() {
  return <interactive-learning guide={guide} />;
}
