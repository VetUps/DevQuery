<template>
  <aside class="ask-question-sidebar">
    <section class="ask-question-sidebar__panel">
      <p class="ask-question-sidebar__eyebrow">Фокус публикации</p>
      <h2 class="ask-question-sidebar__title">Покажите задачу так, чтобы ответ был техническим, а не гадательным</h2>
      <p class="ask-question-sidebar__text">
        Хорошо работают конкретный заголовок, минимальный воспроизводимый пример и ясное ожидание от результата.
      </p>
    </section>

    <section class="ask-question-sidebar__panel ask-question-sidebar__panel--muted">
      <p class="ask-question-sidebar__eyebrow">После публикации</p>
      <p class="ask-question-sidebar__text">
        Вопрос появится в публичной ленте, а на detail-странице вы сразу увидите его в том же виде, что и другие разработчики.
      </p>
    </section>
  </aside>
</template>

<style scoped>
.ask-question-sidebar {
  display: grid;
  gap: var(--space-lg);
}

.ask-question-sidebar__panel {
  display: grid;
  gap: var(--space-md);
  padding: var(--space-xl);
  border: 1px solid rgb(207 198 180 / 0.82);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.72);
}

.ask-question-sidebar__panel--muted {
  background: rgb(228 222 208 / 0.32);
}

.ask-question-sidebar__eyebrow,
.ask-question-sidebar__title,
.ask-question-sidebar__text {
  margin: 0;
}

.ask-question-sidebar__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ask-question-sidebar__title {
  font-size: 26px;
  line-height: 1.08;
  letter-spacing: -0.03em;
}

.ask-question-sidebar__text {
  color: var(--color-muted);
  line-height: 1.65;
}
</style>
