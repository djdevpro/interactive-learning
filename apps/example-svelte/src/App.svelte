<script lang="ts">
  import { InteractiveGuide } from '@interactive-learning/player/svelte';
</script>

<InteractiveGuide src={`${import.meta.env.BASE_URL}guide.json`} />
