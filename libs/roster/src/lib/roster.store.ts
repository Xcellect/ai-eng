// Add the following method to the RosterStoreService class
import { forkJoin, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
  export class RosterStoreService {
      updateUserStats(articleObservables: Observable<any>[], authorMap: Map<string, any>): Observable<any> {
        return forkJoin(articleObservables).pipe(
          tap(() => {
            authorMap.forEach((value, key) => {
              this.updateState((state: any) => {
                return {
                  ...state,
                  userStats: {
                    ...state.userStats,
                    [key]: value,
                  },
                };
              });
            });
          })
        );
      }

      private updateState(updateFn: (state: any) => any) {
        // Implement your update logic here
      }
    }
