import { Artist, ArtistFollow } from "@hoizr-technology/shared";
import { Arg, Ctx, Mutation, Query, Resolver, UseMiddleware } from "type-graphql";
import { isCustomerAuthenticated } from "../../../middlewares/customer-auth";
import Context from "../../../types/context.type";
import ArtistFollowService from "../service/artist-follow.service";

@Resolver()
export class ArtistFollowResolver {
  private readonly service = new ArtistFollowService();

  @Mutation(() => ArtistFollow)
  @UseMiddleware(isCustomerAuthenticated)
  async followArtist(
    @Arg("artistId") artistId: string,
    @Ctx() ctx: Context
  ): Promise<ArtistFollow> {
    return this.service.follow(artistId, ctx);
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isCustomerAuthenticated)
  async unfollowArtist(
    @Arg("artistId") artistId: string,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    return this.service.unfollow(artistId, ctx);
  }

  @Query(() => [Artist])
  @UseMiddleware(isCustomerAuthenticated)
  async myFollowedArtists(@Ctx() ctx: Context): Promise<Artist[]> {
    return this.service.listFollowedArtists(ctx);
  }

  @Query(() => Boolean)
  async isFollowingArtist(
    @Arg("artistId") artistId: string,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    return this.service.isFollowing(artistId, ctx);
  }
}
