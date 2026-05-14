import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addQuestionFavorite,
  fetchQuestionDetail,
  fetchQuestionList,
  normalizeQuestionFavoriteMutationResponse,
  removeQuestionFavorite,
} from '@/features/questions/api/questions'
import { http } from '@/shared/api/http'

describe('question favorites API boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes missing or malformed favorite fields in list payloads to safe defaults', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({
      data: {
        count: 2,
        next: null,
        previous: null,
        results: [
          {
            question_id: 'question-missing-favorites',
            user: 'user-1',
            question_title: 'Missing favorite fields',
            question_status: 'open',
            question_created_at: '2026-04-01T12:00:00Z',
            question_updated_at: '2026-04-01T12:30:00Z',
            tags: [],
          },
          {
            question_id: 'question-malformed-favorites',
            user: 'user-2',
            question_title: 'Malformed favorite fields',
            question_status: 'open',
            question_created_at: '2026-04-02T12:00:00Z',
            question_updated_at: '2026-04-02T12:30:00Z',
            favorites_count: '3',
            is_favorited: 'true',
            tags: [],
          },
        ],
      },
    })

    const page = await fetchQuestionList({ page: 1 })

    expect(page.results[0]).toMatchObject({
      question_id: 'question-missing-favorites',
      favorites_count: 0,
      is_favorited: false,
    })
    expect(page.results[1]).toMatchObject({
      question_id: 'question-malformed-favorites',
      favorites_count: 0,
      is_favorited: false,
    })
  })

  it('normalizes missing favorite fields in detail payloads through the inherited list item shape', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({
      data: {
        question_id: 'question-detail',
        user: 'user-1',
        question_title: 'Detail favorite defaults',
        question_body: 'Body',
        question_status: 'open',
        question_created_at: '2026-04-01T12:00:00Z',
        question_updated_at: '2026-04-01T12:30:00Z',
        upvotes: 0,
        downvotes: 0,
        score: 0,
        user_vote: null,
        tags: [],
      },
    })

    await expect(fetchQuestionDetail('question-detail')).resolves.toMatchObject({
      question_id: 'question-detail',
      favorites_count: 0,
      is_favorited: false,
    })
  })

  it('calls the favorite add and remove endpoints and returns normalized server truth', async () => {
    const postSpy = vi.spyOn(http, 'post').mockResolvedValue({
      data: {
        question_id: 'question-1',
        favorites_count: 4,
        is_favorited: true,
      },
    })
    const deleteSpy = vi.spyOn(http, 'delete').mockResolvedValue({
      data: {
        question_id: 'question-1',
        favorites_count: 3,
        is_favorited: false,
      },
    })

    await expect(addQuestionFavorite('question-1')).resolves.toEqual({
      question_id: 'question-1',
      favorites_count: 4,
      is_favorited: true,
    })
    await expect(removeQuestionFavorite('question-1')).resolves.toEqual({
      question_id: 'question-1',
      favorites_count: 3,
      is_favorited: false,
    })

    expect(postSpy).toHaveBeenCalledWith('/question/question-1/favorite/')
    expect(deleteSpy).toHaveBeenCalledWith('/question/question-1/favorite/')
  })

  it('rejects malformed favorite mutation responses before cache state can trust them', () => {
    expect(() => normalizeQuestionFavoriteMutationResponse({
      question_id: 'question-1',
      favorites_count: '4',
      is_favorited: true,
    })).toThrow('Malformed question favorite response')

    expect(() => normalizeQuestionFavoriteMutationResponse({
      question_id: 'question-1',
      favorites_count: 4,
      is_favorited: 'true',
    })).toThrow('Malformed question favorite response')
  })
})
