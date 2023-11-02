import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@realworld/core/http-client';
import {
  EditArticlePayload,
  Article,
  ArticleResponse,
  EditArticleResponse,
  MultipleCommentsResponse,
  SingleCommentResponse,
} from '@realworld/core/api-types';
import { ArticleListConfig } from '../+state/article-list/article-list.reducer';
import { HttpParams } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ArticlesService {
  constructor(private apiService: ApiService) {}

  getArticle(slug: string): Observable<ArticleResponse> {
    return this.apiService.get<ArticleResponse>('/articles/' + slug);
  }

  getComments(slug: string): Observable<MultipleCommentsResponse> {
    return this.apiService.get<MultipleCommentsResponse>(`/articles/${slug}/comments`);
  }

  deleteArticle(slug: string): Observable<void> {
    return this.apiService.delete<void>('/articles/' + slug);
  }

  deleteComment(commentId: number, slug: string): Observable<void> {
    return this.apiService.delete<void>(`/articles/${slug}/comments/${commentId}`);
  }

  addComment(slug: string, payload = ''): Observable<SingleCommentResponse> {
    return this.apiService.post<SingleCommentResponse, { comment: { body: string } }>(`/articles/${slug}/comments`, {
      comment: { body: payload },
    });
  }

  query(config: ArticleListConfig): Observable<{ articles: Article[]; articlesCount: number }> {
    return this.apiService.get(
      '/articles' + (config.type === 'FEED' ? '/feed' : ''),
      this.toHttpParams(config.filters),
    );
  }

  publishArticle(article: Article): Observable<ArticleResponse> {
    if (article.slug) {
      return this.apiService.put<ArticleResponse, ArticleResponse>('/articles/' + article.slug, {
        article: article,
      });
    }
    return this.apiService.post<ArticleResponse, ArticleResponse>('/articles/', { article: article });
  }

  updateArticle(slug: string, articlePayload: EditArticlePayload): Observable<EditArticleResponse> {
    return this.apiService.put<EditArticleResponse, EditArticleResponse>('/articles/' + slug, {
      article: {
        slug: articlePayload.slug,
        title: articlePayload.title,
        authors: articlePayload.authors,
        description: articlePayload.description,
        body: articlePayload.body,
        tagList: articlePayload.tagList,
        lockedBy: articlePayload.lockedBy,
        lockedAt: articlePayload.lockedAt,
      },
    });
  }

  lockArticle(lockedBy: number, lockedAt: string, slug: string): Observable<void> {
    return this.apiService.post<void, { lockedBy: number; lockedAt: string }>(`/articles/${slug}/lock`, {
      lockedBy,
      lockedAt,
    });
  }

  unlockArticle(slug: string): Observable<void> {
    return this.apiService.post<void, {}>(`/articles/${slug}/unlock`, {});
  }

  // TODO: remove any
  private toHttpParams(params: any) {
    return Object.getOwnPropertyNames(params).reduce((p, key) => p.set(key, params[key]), new HttpParams());
  }
}
