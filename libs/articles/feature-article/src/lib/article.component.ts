import { Field, formsActions, ngrxFormsQuery } from '@realworld/core/forms';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { combineLatest, interval, Observable, of } from 'rxjs';
import { filter, first, switchMap, take, takeWhile } from 'rxjs/operators';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { articleActions, articleQuery, articlesActions } from '@realworld/articles/data-access';
import { selectAuthState, selectLoggedIn, selectUser } from '@realworld/auth/data-access';
import { ArticleMetaComponent } from './article-meta/article-meta.component';
import { CommonModule } from '@angular/common';
import { MarkdownPipe } from './pipes/markdown.pipe';
import { ArticleCommentComponent } from './article-comment/article-comment.component';
import { AddCommentComponent } from './add-comment/add-comment.component';
import { Store } from '@ngrx/store';
import { ApiService } from '@realworld/core/http-client';

const structure: Field[] = [
  {
    type: 'TEXTAREA',
    name: 'comment',
    placeholder: 'Write a comment...',
    attrs: {
      rows: 3,
    },
  },
];

@UntilDestroy()
@Component({
  selector: 'cdt-article',
  standalone: true,
  templateUrl: './article.component.html',
  styleUrls: ['./article.component.css'],
  imports: [CommonModule, ArticleMetaComponent, ArticleCommentComponent, MarkdownPipe, AddCommentComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticleComponent implements OnInit {
  article$ = this.store.select(articleQuery.selectData);
  comments$ = this.store.select(articleQuery.selectComments);
  canModify = false;
  isAuthenticated$ = this.store.select(selectLoggedIn);
  structure$ = this.store.select(ngrxFormsQuery.selectStructure);
  data$ = this.store.select(ngrxFormsQuery.selectData);
  currentUser$ = this.store.select(selectUser);
  touchedForm$ = this.store.select(ngrxFormsQuery.selectTouched);
  articleSlug = '';
  constructor(private readonly store: Store, private readonly apiService: ApiService) {}

  ngOnInit() {
    this.store.dispatch(formsActions.setStructure({ structure }));
    this.store.dispatch(formsActions.setData({ data: '' }));
    this.store
      .select(articleQuery.selectData)
      .pipe(
        untilDestroyed(this),
        switchMap(async (article) => {
          const auth = await this.store.select(selectAuthState).pipe(first()).toPromise();
          return { article, auth };
        }),
      )
      .subscribe(async ({ article, auth }) => {
        const isAuthor =
          article.author.username === auth?.user?.username ||
          article.authors.some((author) => author.username === auth?.user?.username);
        let userIdTuple: [number, string, string][] = [];
        userIdTuple = (await this.apiService
          .post('/user/emailIds', { emails: [auth?.user.email] })
          .pipe(take(1))
          .toPromise()) as [number, string, string][];
        const nullLock = article.lockedBy === null || (article.lockedBy as unknown as number) === 0;
        let lockedByThisUser = false;
        let lockedByThisUserId = false;
        if (!nullLock) {
          lockedByThisUser = article.lockedBy.username === auth?.user?.username;
          lockedByThisUserId = (article.lockedBy as unknown as number) === userIdTuple[0][0];
        }
        this.canModify = isAuthor && (lockedByThisUser || lockedByThisUserId || nullLock);
        this.articleSlug = article.slug;
      });

    // Do not call the below functions until above is done
    if (this.articleSlug !== '' || this.articleSlug !== undefined) {
      const startTime = Date.now();
      interval(100)
        .pipe(takeWhile(() => Date.now() - startTime < 500))
        .subscribe(() => {
          this.store.dispatch(articleActions.loadArticle({ slug: this.articleSlug }));
        });
    }
  }

  follow(username: string) {
    this.store.dispatch(articleActions.follow({ username }));
  }
  unfollow(username: string) {
    this.store.dispatch(articleActions.unfollow({ username }));
  }
  favorite(slug: string) {
    this.store.dispatch(articlesActions.favorite({ slug }));
  }
  unfavorite(slug: string) {
    this.store.dispatch(articlesActions.unfavorite({ slug }));
  }
  delete(slug: string) {
    this.store.dispatch(articleActions.deleteArticle({ slug }));
  }
  deleteComment(data: { commentId: number; slug: string }) {
    this.store.dispatch(articleActions.deleteComment(data));
  }
  submit(slug: string) {
    this.store.dispatch(articleActions.addComment({ slug }));
  }
  updateForm(changes: any) {
    this.store.dispatch(formsActions.updateData({ data: changes }));
  }

  ngOnDestroy() {
    this.store.dispatch(articleActions.initializeArticle());
  }
}
