<script setup lang="ts">
import AskQuestionSidebar from '@/features/questions/components/AskQuestionSidebar.vue'
import QuestionCreateForm from '@/features/questions/components/QuestionCreateForm.vue'
import AppShellLayout from '@/layouts/AppShellLayout.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'
</script>

<template>
  <AppShellLayout>
    <section class="ask-question-page">
      <div class="ask-question-page__intro">
        <p class="ask-question-page__eyebrow">Авторский режим</p>
        <h1 class="ask-question-page__title">
          Сформулируйте вопрос так, чтобы на него можно было ответить по коду и по сути
        </h1>
      </div>

      <div class="ask-question-page__content">
        <SurfacePanel class="ask-question-page__form-panel" variant="accent">
          <QuestionCreateForm />
        </SurfacePanel>

        <AskQuestionSidebar />
      </div>
    </section>
  </AppShellLayout>
</template>

<style scoped>
.ask-question-page {
  display: grid;
  gap: var(--space-xl);
  min-width: 0;
}

.ask-question-page__content {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(280px, 0.95fr);
  gap: var(--space-xl);
  align-items: start;
  min-width: 0;
}

.ask-question-page__intro,
.ask-question-page__form-panel {
  display: grid;
  gap: var(--space-md);
  min-width: 0;
}

.ask-question-page__form-panel :deep(*) {
  min-width: 0;
}

.ask-question-page__eyebrow,
.ask-question-page__title {
  margin: 0;
}

.ask-question-page__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ask-question-page__title {
  max-width: 18ch;
  font-size: clamp(34px, 5vw, 46px);
  line-height: 1.02;
  letter-spacing: -0.05em;
  overflow-wrap: anywhere;
}

@media (width <= 980px) {
  .ask-question-page__content {
    grid-template-columns: 1fr;
  }

  .ask-question-page__title {
    max-width: none;
  }
}
</style>
