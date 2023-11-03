import { DynamicFormComponent, Field, formsActions, ListErrorsComponent, ngrxFormsQuery } from '@realworld/core/forms';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { OnDestroy } from '@angular/core';
import { Validators } from '@angular/forms';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Store } from '@ngrx/store';
import { EditArticlePayload } from '@realworld/core/api-types';
import { articleEditActions, articleQuery } from '@realworld/articles/data-access';
import { Article, ArticleResponse } from '@realworld/core/api-types/src/lib/article';
import { filter, startWith, switchMap, take } from 'rxjs/operators';
import { ApiService } from '@realworld/core/http-client';
import { combineLatest, of, Subscription } from 'rxjs';
import { NavigationEnd, Router } from '@angular/router';

import { articleActions } from '@realworld/articles/data-access';
import { selectAuthState } from '@realworld/auth/data-access/src';

const structure: Field[] = [
  {
    type: 'INPUT',
    name: 'title',
    placeholder: 'Article Title',
    validator: [Validators.required],
  },
  {
    type: 'INPUT',
    name: 'description',
    placeholder: "What's this article about?",
    validator: [Validators.required],
  },
  {
    type: 'TEXTAREA',
    name: 'body',
    placeholder: 'Write your article (in markdown)',
    validator: [Validators.required],
  },
  {
    type: 'INPUT',
    name: 'tagList',
    placeholder: 'Enter Tags',
    validator: [],
  },
  {
    type: 'INPUT',
    name: 'authorEmails',
    placeholder: 'Add Authors',
    validator: [],
  },
];
let isNewArticle = false;
let newArticle: Article = {} as Article;
let emails: string[] = [];
let authorEmailMap = new Map<string, [string, number]>();
let authorIds: number[] = [];
let slug: string = '';
let articlePayload = {
  title: '',
  description: '',
  body: '',
  tagList: [],
  authors: [],
  lockedBy: 0,
  lockedAt: '',
};
let articleAuthorEmails: string[] = [];
@UntilDestroy()
@Component({
  selector: 'cdt-article-edit',
  standalone: true,
  templateUrl: './article-edit.component.html',
  styleUrls: ['./article-edit.component.css'],
  imports: [DynamicFormComponent, ListErrorsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticleEditComponent implements OnInit, OnDestroy {
  structure$ = this.store.select(ngrxFormsQuery.selectStructure);
  data$ = this.store.select(ngrxFormsQuery.selectData);
  // @ts-ignore
  private navigationSubscription: Subscription;
  private inactivityTimer!: number;
  private startUrl!: string;
  private router: Router;
  constructor(router: Router, private readonly store: Store, private readonly apiService: ApiService) {
    this.router = router;
  }

  ngOnInit() {
    this.store.dispatch(formsActions.setStructure({ structure }));

    // Get the current URL
    const currentUrl = this.router.url;
    // Handle the URL
    if (currentUrl === '/editor') {
      isNewArticle = true;
      this.store
        .select(articleQuery.selectData)
        .pipe(untilDestroyed(this))
        .subscribe((article) => this.store.dispatch(formsActions.setData({ data: article })));
      return;
    }
    const regex = /^\/editor\/([^\/]+)$/;
    const match = currentUrl.match(regex);
    if (match) {
      slug = match[1];

      this.navigationSubscription = this.router.events
        .pipe(
          // Emit a value immediately upon subscription
          startWith(new NavigationEnd(0, this.router.url, this.router.url)),
          // Filter the events to only include NavigationEnd events
          filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        )
        .subscribe((event: NavigationEnd) => {
          // Handle the URL
          if (event.url === '/editor') {
            isNewArticle = true;
            this.store.dispatch(formsActions.setData({ data: {} }));
            const lastEditedArticleSlug = localStorage.getItem('lastEditedArticle')!;
            this.store.dispatch(articleActions.unlockArticle({ slug: lastEditedArticleSlug }));
            window.location.reload();
            return;
          }
          isNewArticle = false;
          this.store
            .select(articleQuery.selectData)
            .pipe(untilDestroyed(this))
            .subscribe(async (article) => {
              const unfilteredAuthors = article?.authors ? [...article.authors, article.author] : [article?.author];
              // get rid of duplicate authors by username
              const authors = unfilteredAuthors.filter(
                (author, index, self) => index === self.findIndex((t) => t?.username === author?.username),
              );
              // get author usernames
              const authorUsernames = authors.map((author: { username: string }) => author?.username);
              // call getAuthorEmails() here and wait for it to complete
              await this.getAuthorEmails(authorUsernames);
              // Get current user's email and id
              const currentUser: any = await this.apiService.get('/user').pipe(take(1)).toPromise();
              // use the current user email to get the user id from authorEmailMap
              // use this store dispatch to get the auth state and then get the user id using the authorEmailMap
              const currentUserId = authorEmailMap.get(currentUser.username)?.[1];
              const currentUsername = authorEmailMap.get(currentUser.username)?.[0];

              console.log(authorEmailMap);
              const userIdString = localStorage.getItem('currentUserid');
              const userId = Number(userIdString);

              if (!isNaN(userId)) {
                console.log('User ID:', userId);
              } else {
                console.log('User ID is not a valid number');
              }
              this.apiService
                .get(`/articles/${slug}`)
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
                  console.log('>>>>>>>>>>>> LOCKEDBY: ', latestLockedBy);
                  // Compare with the current user ID and unlock the article if they match
                  if (
                    slug !== undefined &&
                    latestLockedBy !== undefined &&
                    latestLockedBy !== null &&
                    latestLockedBy !== '' &&
                    userId !== undefined &&
                    userId !== null &&
                    userId !== 0 &&
                    latestLockedBy !== userId.toString()
                  ) {
                    this.store.dispatch(
                      articleActions.lockArticle({
                        lockedBy: userId,
                        lockedAt: new Date().toISOString(),
                        slug: slug,
                      }),
                    );
                  }
                })
                .catch((error) => {
                  console.error('Failed to get article by slug', error);
                });

              // Start the inactivity timer
              this.startInactivityTimer();

              articleAuthorEmails = Array.from(authorEmailMap.values()).map((tuple) => tuple[0]);
              authorIds = Array.from(authorEmailMap.values()).map((tuple) => tuple[1]);
              const updatedArticle = {
                ...article,
                authorEmails: articleAuthorEmails,
              };
              this.store.dispatch(formsActions.setData({ data: updatedArticle }));
              // get the corresponding id of article.lockedBy.username from authorEmailMap
              const lockedById = authorEmailMap.get(updatedArticle?.lockedBy?.username)?.[1];

              newArticle = updatedArticle;
              localStorage.setItem('lastEditedArticle', slug);
            });
        });
    } else {
      isNewArticle = true;
      this.store
        .select(articleQuery.selectData)
        .pipe(untilDestroyed(this))
        .subscribe((article) => this.store.dispatch(formsActions.setData({ data: article })));
    }
  }

  private async unlockArticle(thisSlug: string) {
    this.store
      .select(selectAuthState)
      .pipe(
        filter((auth) => auth.loggedIn),
        switchMap((auth) => combineLatest([of(auth), this.store.select(articleQuery.getAuthorUsername)])),
        untilDestroyed(this),
      )
      .subscribe(([auth, username]) => {
        if (
          thisSlug !== undefined &&
          thisSlug !== null &&
          thisSlug !== '' &&
          newArticle.lockedBy.username === auth.user.username
        ) {
          this.store.dispatch(articleActions.unlockArticle({ slug }));
        }
      });
  }

  async getAuthorEmails(authorUsername: string[]) {
    // Get the emails of the authors
    this.apiService
      .post('/user/userIds', { usernames: authorUsername })
      .pipe(take(1))
      .subscribe((newEmailIdTuple: any) => {
        // email and ids are returned as return in the format of [ ["email1", id1], ["email2", id2], ... ]
        const emailIdTuple = newEmailIdTuple as [number, string, string][];
        // Add the username -> email, id mapping to the userEmailMap
        emailIdTuple.forEach((tuple) => {
          authorEmailMap.set(tuple[1], [tuple[2], tuple[0]]);
        });
      });
  }

  updateForm(changes: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.store.dispatch(formsActions.updateData({ data: changes }));

      if (changes.title || changes.description || changes.body || changes.tagList || changes.authorEmails) {
        articlePayload.title = changes.title;
        articlePayload.description = changes.description;
        articlePayload.body = changes.body;
        articlePayload.tagList =
          typeof changes.tagList === 'string'
            ? changes.tagList.split(',').map((item: string) => item.trim())
            : changes.tagList;

        const newEmails =
          typeof changes.authorEmails === 'string'
            ? changes.authorEmails.split(',').map((email: string) => email.trim())
            : changes.authorEmails;

        const newEmailsToAdd = newEmails.filter((email: string) => !emails.includes(email));
        // If there are new emails, add them to the emails array and perform API request
        if (newEmailsToAdd.length > 0) {
          // Perform API request to get user IDs
          this.apiService
            .post('/user/emailIds', { emails: newEmailsToAdd })
            .pipe(take(1))
            .toPromise() // Convert Observable to Promise
            .then((authorIdTuple: any) => {
              // get the author ids returned from the API call. Id is at index 2
              authorIds = authorIdTuple.map((tuple: any) => tuple[0]);
              //articlePayload.authors = authorIds;
              resolve();
            })
            .catch((error) => {
              reject(error);
            });
        } else {
          resolve();
        }
      } else {
        resolve();
      }
    });
  }

  async submit() {
    await this.updateForm({}); // Wait for the updateForm function to resolve
    if (
      articlePayload != undefined &&
      articlePayload?.title != '' &&
      articlePayload?.description != '' &&
      articlePayload?.body != ''
    ) {
      const currentUserInSubmit = localStorage.getItem('currentUserid')?.replace(/\s+/g, '');
      // convert currentUserInSubmit to number
      const currentUserInSubmitNumber = Number(currentUserInSubmit);
      let newAuthorIds: number[] = [];
      console.log(authorIds);

      if (currentUserInSubmitNumber != null && newAuthorIds != null) {
        newAuthorIds = [...authorIds, currentUserInSubmitNumber];
        newAuthorIds = [...new Set(newAuthorIds)].filter((id) => id !== 0);
      } else if (currentUserInSubmitNumber != null && newAuthorIds == null) {
        newAuthorIds = [currentUserInSubmitNumber];
      }

      let payload: { article: EditArticlePayload }; // Declare the type of the payload variable
      payload = {
        article: {
          slug: slug,
          authors: newAuthorIds,
          title: articlePayload?.title,
          description: articlePayload?.description,
          body: articlePayload?.body,
          tagList: articlePayload?.tagList,
          lockedBy: null as any,
          lockedAt: new Date().toISOString(),
        },
      };
      console.log('////////////////////////////////////////////////////////articlePayload', payload);

      if (!isNewArticle) {
        this.store.dispatch(articleEditActions.editArticle(payload));
      } else {
        if (payload.article.slug != '') payload.article.slug = '';
        this.store.dispatch(articleEditActions.publishArticle(payload));
        isNewArticle = false;
      }

      console.log('unlocking article');
      if (
        payload.article.slug != '' &&
        localStorage.getItem('currentUserid') != localStorage.getItem('latestLockedBy') &&
        localStorage.getItem('currentUserid') != null &&
        localStorage.getItem('latestLockedBy') != null
      )
        this.store.dispatch(articleActions.unlockArticle({ slug: slug }));
    }
  }
  private appendRandomString(inputString: string) {
    const randomString = Math.random().toString(36).substring(2, 7);
    return `${inputString}-${randomString}`;
  }

  private startInactivityTimer() {
    // Clear any existing timer
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    // Start a new timer
    this.inactivityTimer = setTimeout(() => {
      // Release the article lock after 5 minutes of inactivity
      this.unlockArticle(slug);
    }, 5 * 60 * 1000);
  }

  ngOnDestroy() {
    this.store.dispatch(formsActions.initializeForm());
    if (this.navigationSubscription) {
      this.navigationSubscription.unsubscribe();
    }
    // Clear the inactivity timer
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
  }
}
