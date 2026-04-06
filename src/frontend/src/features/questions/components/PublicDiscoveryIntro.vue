<script setup lang="ts">
const props = defineProps<{
  totalQuestions: number
}>()

const introHighlights = [
  'Открытые инженерные вопросы без лишнего шума.',
]
</script>

<template>
  <section class="public-discovery-intro">
    <div class="public-discovery-intro__copy">
      <p class="public-discovery-intro__eyebrow">Публичная лента</p>
      <h1 class="public-discovery-intro__title">Вопросы для разработчиков</h1>
      <p class="public-discovery-intro__description">
        Открывайте обсуждения, следите за обновлениями и постепенно собирайте
        личную базу ответов вокруг живых инженерных задач.
      </p>
    </div>

    <div class="public-discovery-intro__spotlight">
      <div class="public-discovery-intro__count-block">
        <span class="public-discovery-intro__count-label">В ленте сейчас</span>
        <strong class="public-discovery-intro__count-value">{{ props.totalQuestions }}</strong>
        <span class="public-discovery-intro__count-caption">вопросов</span>
      </div>

      <ul class="public-discovery-intro__highlights" aria-label="Преимущества главной страницы">
        <li v-for="highlight in introHighlights" :key="highlight">
          {{ highlight }}
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.public-discovery-intro {
  display: grid;
  gap: var(--space-xl);
  padding: var(--space-2xl);
  border: 1px solid rgb(207 198 180 / 0.88);
  border-radius: var(--radius-lg);
  background:
    linear-gradient(135deg, rgb(255 255 255 / 0.84), rgb(255 250 241 / 0.92)),
    linear-gradient(180deg, rgb(228 222 208 / 0.42), transparent);
  box-shadow: 0 28px 70px rgb(69 58 38 / 0.08);
}

.public-discovery-intro__copy,
.public-discovery-intro__spotlight {
  display: grid;
  gap: var(--space-md);
}

.public-discovery-intro__eyebrow,
.public-discovery-intro__title,
.public-discovery-intro__description,
.public-discovery-intro__count-label,
.public-discovery-intro__count-caption {
  margin: 0;
}

.public-discovery-intro__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.public-discovery-intro__title {
  max-width: 12ch;
  font-size: clamp(36px, 6vw, 54px);
  line-height: 0.96;
  letter-spacing: -0.04em;
}

.public-discovery-intro__description {
  max-width: 56ch;
  color: var(--color-muted);
  font-size: 17px;
  line-height: 1.65;
}

.public-discovery-intro__spotlight {
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  align-items: end;
}

.public-discovery-intro__count-block {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-lg);
  border: 1px solid rgb(14 116 144 / 0.16);
  border-radius: var(--radius-md);
  background: rgb(14 116 144 / 0.06);
}

.public-discovery-intro__count-label,
.public-discovery-intro__count-caption {
  color: var(--color-muted);
}

.public-discovery-intro__count-value {
  font-size: 40px;
  line-height: 1;
  letter-spacing: -0.05em;
}

.public-discovery-intro__highlights {
  display: grid;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.public-discovery-intro__highlights li {
  padding: var(--space-md);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.72);
  color: var(--color-text);
  line-height: 1.55;
}

@media (width <= 760px) {
  .public-discovery-intro {
    padding: var(--space-lg);
  }

  .public-discovery-intro__spotlight {
    grid-template-columns: 1fr;
  }
}
</style>
