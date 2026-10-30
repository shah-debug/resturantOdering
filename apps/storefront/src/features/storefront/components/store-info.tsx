import { DAYS_OF_WEEK, type Storefront } from '@app/contracts';
import { formatClockTime } from '../availability';

export function StoreInfo({ storefront }: { storefront: Storefront }) {
  if (storefront.branches.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="store-info-heading" className="flex flex-col gap-4 border-t py-8">
      <h2 id="store-info-heading" className="text-lg font-semibold">
        Hours and location
      </h2>
      <div className="grid gap-6 sm:grid-cols-2">
        {storefront.branches.map((branch) => (
          <div key={branch.id} className="flex flex-col gap-3">
            <div>
              <h3 className="font-medium">{branch.name}</h3>
              <address className="text-sm text-muted-foreground not-italic">
                {branch.addressLine}
                {branch.area ? `, ${branch.area}` : ''}, {branch.city}
                {branch.phone ? (
                  <>
                    <br />
                    <a className="underline underline-offset-4" href={`tel:${branch.phone}`}>
                      {branch.phone}
                    </a>
                  </>
                ) : null}
              </address>
            </div>
            {branch.openingHours.length > 0 ? (
              <table className="w-full max-w-xs text-sm">
                <caption className="sr-only">Opening hours for {branch.name}</caption>
                <tbody>
                  {DAYS_OF_WEEK.map((day) => {
                    const intervals = branch.openingHours.filter(
                      (interval) => interval.dayOfWeek === day.value,
                    );
                    return (
                      <tr key={day.value}>
                        <th scope="row" className="py-0.5 pr-4 text-left font-normal">
                          {day.label}
                        </th>
                        <td className="py-0.5 text-muted-foreground">
                          {intervals.length === 0
                            ? 'Closed'
                            : intervals
                                .map(
                                  (interval) =>
                                    `${formatClockTime(interval.opensAt)} – ${formatClockTime(interval.closesAt)}`,
                                )
                                .join(', ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">Opening hours not published.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
