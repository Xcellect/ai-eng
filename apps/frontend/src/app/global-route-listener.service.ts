// src/app/global-route-listener.service.ts
import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Store } from '@ngrx/store';
import { filter, first, switchMap, take } from 'rxjs/operators';
import { Subscription, combineLatest } from 'rxjs';
import { articleActions, articleQuery } from '@realworld/articles/data-access';
import { authActions, selectAuthState } from '@realworld/auth/data-access/src';
import { untilDestroyed } from '@ngneat/until-destroy';
import { ApiService } from '@realworld/core/http-client';
interface ArticleResponse {
  article: {
    lockedBy: string;
    // ... other fields you might need
  };
}
@Injectable({
  providedIn: 'root',
})
export class GlobalRouteListenerService {
  private routerSubscription: Subscription;

  constructor(private router: Router, private store: Store, private readonly apiService: ApiService) {
    this.apiService
      .get('/user')
      .pipe(take(1))
      .toPromise()
      .then(async (currentUser: any) => {
        console.log('>>>>>>>>>>>> CURRENT USER: ', currentUser);
        if (currentUser !== undefined) {
          const userIdTuple = (await this.apiService
            .post('/user/emailIds', { emails: [currentUser?.user.email] })
            .pipe(take(1))
            .toPromise()) as [number, string, string][];
          console.log('>>>>>>>>>>>> USER ID TUPLE: ', userIdTuple);
          localStorage.setItem('currentUserid', JSON.stringify(userIdTuple[0][0]));
        }
      });
    this.routerSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(async (event: NavigationEnd) => {
        const url = event.urlAfterRedirects!;
        if (
          !url.match(/^\/editor\/[^\/]+$/) ||
          !url.match(/^\/article\/[^\/]+$/) ||
          url === '/login' ||
          url === '/editor'
        ) {
          // When I'm outside the editor, I want to release the lock by calling API
          // Access the last edited article slug from local storage

          const lastEditedArticleSlug = localStorage.getItem('lastEditedArticle');
          const currentUserid = localStorage.getItem('currentUserid')?.replace(/\s+/g, '');
          console.log('>>>>>>>>>>>> CURR USER: ', currentUserid);
          console.log('>>>>>>>>>>>> LAST EDITED ARTICLE: ', lastEditedArticleSlug);
          // Call API to get article by slug
          if (lastEditedArticleSlug && currentUserid) {
            this.apiService
              .get(`/articles/${lastEditedArticleSlug}`)
              .pipe(take(1))
              .toPromise()
              .then((response) => {
                const articleResponse = response as ArticleResponse; // Assert the type of the response
                // Extract the lockedBy value from the article
                let latestLockedBy = JSON.stringify(articleResponse.article.lockedBy);
                const regex = /"id":(\d+)/;
                const match = latestLockedBy?.match(regex);
                if (match) {
                  latestLockedBy = match[1];
                }
                // Compare with the current user ID and unlock the article if they match
                if (
                  lastEditedArticleSlug !== undefined &&
                  latestLockedBy &&
                  currentUserid &&
                  latestLockedBy === currentUserid
                ) {
                  console.log('>>>>>>>>>>>> UNLOCKING ARTICLE: ', lastEditedArticleSlug);
                  this.store.dispatch(articleActions.unlockArticle({ slug: lastEditedArticleSlug }));
                }
              })
              .catch((error) => {
                console.error('Failed to get article by slug', error);
              });
          }
        }
      });
  }

  ngOnDestroy() {
    // Unsubscribe from the router events when the service is destroyed
    this.routerSubscription.unsubscribe();
  }
}
