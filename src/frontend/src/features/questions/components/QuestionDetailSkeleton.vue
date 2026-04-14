<template>
  <section class="question-detail-skeleton" data-testid="question-detail-skeleton">
    <div class="question-detail-skeleton__main">
      <span class="question-detail-skeleton__pill skeleton" />
      <span class="question-detail-skeleton__meta skeleton" />
      <span class="question-detail-skeleton__title skeleton" />
      <span class="question-detail-skeleton__title question-detail-skeleton__title--short skeleton" />
      <span class="question-detail-skeleton__body skeleton" />
      <span class="question-detail-skeleton__body question-detail-skeleton__body--short skeleton" />
      <span class="question-detail-skeleton__body question-detail-skeleton__body--shorter skeleton" />
    </div>

    <div class="question-detail-skeleton__side">
      <span class="question-detail-skeleton__score skeleton" />
      <span class="question-detail-skeleton__meter skeleton" />
      <span class="question-detail-skeleton__meter skeleton" />
    </div>
  </section>
</template>

<style scoped>
.question-detail-skeleton {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
  gap: var(--space-xl);
  padding: var(--space-2xl);
  border: 1px solid rgb(207 198 180 / 0.72);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.7);
}

.question-detail-skeleton__main,
.question-detail-skeleton__side {
  display: grid;
  gap: var(--space-md);
}

.question-detail-skeleton__pill,
.question-detail-skeleton__meta,
.question-detail-skeleton__title,
.question-detail-skeleton__body,
.question-detail-skeleton__score,
.question-detail-skeleton__meter {
  display: inline-flex;
  border-radius: 999px;
}

.question-detail-skeleton__pill {
  width: 120px;
  height: 32px;
}

.question-detail-skeleton__meta {
  width: 190px;
  height: 14px;
}

.question-detail-skeleton__title {
  width: min(100%, 580px);
  height: 32px;
  border-radius: 18px;
}

.question-detail-skeleton__title--short {
  width: min(100%, 420px);
}

.question-detail-skeleton__body {
  width: 100%;
  height: 18px;
  border-radius: 10px;
}

.question-detail-skeleton__body--short {
  width: 86%;
}

.question-detail-skeleton__body--shorter {
  width: 64%;
}

.question-detail-skeleton__score {
  width: 120px;
  height: 58px;
  border-radius: 24px;
}

.question-detail-skeleton__meter {
  width: 100%;
  height: 14px;
}

.skeleton {
  background:
    linear-gradient(90deg, rgb(228 222 208 / 0.45), rgb(255 255 255 / 0.86), rgb(228 222 208 / 0.45));
  background-size: 220% 100%;
  animation: skeleton-shimmer 1.3s linear infinite;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -40% 0;
  }
}

@media (width <= 900px) {
  .question-detail-skeleton {
    grid-template-columns: 1fr;
    padding: var(--space-lg);
  }
}
</style>
