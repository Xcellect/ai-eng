import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { EditArticlePayload } from '@realworld/core/api-types/src/lib/article';

export const articleEditActions = createActionGroup({
  source: 'Article Edit',
  events: {
    publishArticle: emptyProps(),
    publishArticleSuccess: emptyProps(),
    editArticle: props<{ article: EditArticlePayload }>(),
    editArticleSuccess: emptyProps(),
    editArticleFailure: props<{ error: any }>(),
  },
});
export { EditArticlePayload };
