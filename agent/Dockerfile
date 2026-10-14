# Build a static agentd binary.
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/agentd ./cmd/agentd

FROM alpine:3.20
RUN adduser -D -u 10001 -H agent
COPY --from=build /out/agentd /usr/local/bin/agentd
USER agent
EXPOSE 9797
# Provide config via a mounted file or flags:
ENTRYPOINT ["agentd"]
