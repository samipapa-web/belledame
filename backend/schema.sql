-- Products table for shared catalog
create table if not exists products (
  id text primary key,
  name text not null,
  brand text not null,
  price integer not null,
  currency text default 'FCFA',
  rubrique text not null,
  sous_rubrique text not null,
  categorie text not null,
  description text default '',
  image text default '',
  active integer default 1,
  updated_at text default (datetime('now'))
);

create trigger if not exists trg_products_updated
after update on products
for each row
begin
  update products set updated_at = datetime('now') where id = old.id;
end;
